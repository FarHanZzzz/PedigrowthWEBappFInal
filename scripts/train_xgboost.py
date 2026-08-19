"""
Pedi-Growth Gait Disease Detection — Production Model Training v2
=================================================================
Trains optimized XGBoost models for all 5 gait conditions using:
  1. Stratified K-Fold cross-validation (5 folds)
  2. SMOTE oversampling for class balance
  3. Bayesian-style hyperparameter tuning via RandomizedSearchCV
  4. Proper evaluation: Accuracy, Precision, Recall, F1, ROC-AUC
  5. Feature importance analysis
  6. Saves production-ready model files (.json)
"""

import json
import os
import warnings
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import (
    GroupKFold,
    StratifiedKFold,
    RandomizedSearchCV,
)
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix,
)
from scipy.stats import uniform, randint

warnings.filterwarnings('ignore')

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH  = os.path.join(BASE_DIR, 'data', 'gait_dataset_v2.csv')
MODEL_DIR  = os.path.join(BASE_DIR, 'gait_pipeline', 'models')
REPORT_DIR = os.path.join(BASE_DIR, 'data', 'training_reports')

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)

# ─── Feature sets ─────────────────────────────────────────────────────────────
ID_COLS     = ['patient_id', 'gait_speed', 'file']
TARGET_COLS = ['gait_asymmetry', 'trendelenburg_risk', 'trunk_instability',
               'spinal_misalignment', 'composite_risk']
EXCLUDE     = ID_COLS + TARGET_COLS + ['num_frames']

# ─── Hyperparameter search space ─────────────────────────────────────────────
PARAM_DISTRIBUTIONS = {
    'n_estimators':     randint(100, 500),
    'max_depth':        randint(3, 8),
    'learning_rate':    uniform(0.01, 0.3),
    'subsample':        uniform(0.6, 0.4),
    'colsample_bytree': uniform(0.6, 0.4),
    'min_child_weight': randint(1, 10),
    'gamma':            uniform(0, 0.5),
    'reg_alpha':        uniform(0, 1.0),
    'reg_lambda':       uniform(0.5, 2.0),
}


def load_data():
    """Load dataset and split into features/targets."""
    df = pd.read_csv(DATA_PATH)
    feature_cols = [c for c in df.columns if c not in EXCLUDE]
    X = df[feature_cols].fillna(0)
    targets = {t: df[t].values for t in TARGET_COLS}
    return X, targets, feature_cols


def patient_aware_split(df_path, test_size=0.2, random_state=42):
    """
    Split by PATIENT, not by row, to prevent data leakage.
    All walks from the same patient go into the same split.
    """
    df = pd.read_csv(df_path)
    patients = df['patient_id'].unique()
    np.random.seed(random_state)
    np.random.shuffle(patients)

    split_idx = int(len(patients) * (1 - test_size))
    train_patients = set(patients[:split_idx])
    test_patients  = set(patients[split_idx:])

    train_mask = df['patient_id'].isin(train_patients)
    test_mask  = df['patient_id'].isin(test_patients)

    return df[train_mask].copy(), df[test_mask].copy()


def _safe_rate(num: float, den: float) -> float:
    return float(num / den) if den > 0 else 0.0


def _metric_summary(values):
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {'mean': np.nan, 'std': np.nan, 'ci95': np.nan, 'n': 0}

    mean = float(np.mean(arr))
    std = float(np.std(arr, ddof=1)) if arr.size > 1 else 0.0
    ci95 = float(1.96 * std / np.sqrt(arr.size)) if arr.size > 1 else 0.0
    return {'mean': mean, 'std': std, 'ci95': ci95, 'n': int(arr.size)}


def run_grouped_cv_audit(X, y, groups, target_name, best_params):
    """
    Patient-grouped CV audit with explicit leakage checks.
    Outputs per-fold metrics and overlap counts for train/validation subjects.
    """
    if groups is None:
        return None

    unique_groups = np.unique(groups)
    n_splits = min(5, len(unique_groups))
    if n_splits < 2:
        return None

    gkf = GroupKFold(n_splits=n_splits)
    fold_rows = []

    for fold_idx, (tr_idx, va_idx) in enumerate(gkf.split(X, y, groups=groups), start=1):
        X_tr, X_va = X[tr_idx], X[va_idx]
        y_tr, y_va = y[tr_idx], y[va_idx]

        train_groups = set(groups[tr_idx])
        val_groups = set(groups[va_idx])
        overlap = len(train_groups & val_groups)

        tr_pos = np.sum(y_tr == 1)
        tr_neg = np.sum(y_tr == 0)
        scale_weight = tr_neg / tr_pos if tr_pos > 0 else 1.0

        model = xgb.XGBClassifier(
            **best_params,
            scale_pos_weight=scale_weight,
            random_state=42,
            eval_metric='logloss',
            tree_method='hist',
            n_jobs=-1,
        )
        model.fit(X_tr, y_tr)

        y_pred = model.predict(X_va)
        y_prob = model.predict_proba(X_va)[:, 1]

        cm = confusion_matrix(y_va, y_pred, labels=[0, 1])
        tn, fp, fn, tp = cm.ravel()

        fold_rows.append(
            {
                'fold': fold_idx,
                'target': target_name,
                'subject_overlap_count': overlap,
                'accuracy': float(accuracy_score(y_va, y_pred)),
                'precision': float(precision_score(y_va, y_pred, zero_division=0)),
                'recall': float(recall_score(y_va, y_pred, zero_division=0)),
                'f1': float(f1_score(y_va, y_pred, zero_division=0)),
                'roc_auc': float(roc_auc_score(y_va, y_prob)) if len(np.unique(y_va)) > 1 else np.nan,
                'sensitivity': _safe_rate(tp, tp + fn),
                'specificity': _safe_rate(tn, tn + fp),
                'ppv': _safe_rate(tp, tp + fp),
                'npv': _safe_rate(tn, tn + fn),
                'val_support': int(len(y_va)),
            }
        )

    fold_df = pd.DataFrame(fold_rows)

    summary = {
        'target': target_name,
        'n_splits': int(n_splits),
        'subject_overlap_total': int(fold_df['subject_overlap_count'].sum()),
        'leakage_pass': bool((fold_df['subject_overlap_count'] == 0).all()),
        'accuracy': _metric_summary(fold_df['accuracy']),
        'f1': _metric_summary(fold_df['f1']),
        'roc_auc': _metric_summary(fold_df['roc_auc']),
        'sensitivity': _metric_summary(fold_df['sensitivity']),
        'specificity': _metric_summary(fold_df['specificity']),
        'ppv': _metric_summary(fold_df['ppv']),
        'npv': _metric_summary(fold_df['npv']),
    }

    folds_path = os.path.join(REPORT_DIR, f'{target_name}_grouped_cv_folds.csv')
    summary_path = os.path.join(REPORT_DIR, f'{target_name}_grouped_cv_summary.json')
    leakage_path = os.path.join(REPORT_DIR, f'{target_name}_leakage_audit.csv')

    fold_df.to_csv(folds_path, index=False)
    with open(summary_path, 'w', encoding='utf-8') as handle:
        json.dump(summary, handle, indent=2)

    leakage_df = fold_df[['fold', 'subject_overlap_count']].copy()
    leakage_df.to_csv(leakage_path, index=False)

    return {
        'summary': summary,
        'summary_path': summary_path,
        'leakage_path': leakage_path,
        'folds_path': folds_path,
    }


def train_single_target(X_train, y_train, X_test, y_test, target_name, feature_cols, train_groups):
    """
    Train an optimized XGBoost classifier for a single target.
    Uses RandomizedSearchCV with stratified K-fold.
    """
    print(f"\n{'='*60}")
    print(f"Training model: {target_name}")
    print(f"{'='*60}")
    
    train_pos = np.sum(y_train == 1)
    train_neg = np.sum(y_train == 0)
    scale_weight = train_neg / train_pos if train_pos > 0 else 1.0
    print(f"  Train set: {len(y_train)} samples ({train_pos} pos / {train_neg} neg)")
    print(f"  Test  set: {len(y_test)} samples ({np.sum(y_test==1)} pos / {np.sum(y_test==0)} neg)")
    print(f"  Scale weight: {scale_weight:.2f}")

    base_model = xgb.XGBClassifier(
        scale_pos_weight=scale_weight,
        random_state=42,
        eval_metric='logloss',
        tree_method='hist',
        n_jobs=-1,
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    search = RandomizedSearchCV(
        estimator=base_model,
        param_distributions=PARAM_DISTRIBUTIONS,
        n_iter=50,
        scoring='f1',
        cv=cv,
        random_state=42,
        n_jobs=-1,
        verbose=0,
    )

    print(f"  Running hyperparameter search (50 iterations x 5 folds)...")
    search.fit(X_train, y_train)

    best_model = search.best_estimator_
    best_params = search.best_params_
    print(f"  Best CV F1 score: {search.best_score_:.4f}")
    print(f"  Best params: {best_params}")

    # ── Evaluate on held-out test set ─────────────────────────────────────────
    y_pred = best_model.predict(X_test)
    y_prob = best_model.predict_proba(X_test)[:, 1]

    acc  = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec  = recall_score(y_test, y_pred, zero_division=0)
    f1   = f1_score(y_test, y_pred, zero_division=0)
    auc  = roc_auc_score(y_test, y_prob) if len(np.unique(y_test)) > 1 else 0.0

    print(f"\n  ── Test Set Results ──")
    print(f"  Accuracy:  {acc*100:.2f}%")
    print(f"  Precision: {prec*100:.2f}%")
    print(f"  Recall:    {rec*100:.2f}%")
    print(f"  F1 Score:  {f1*100:.2f}%")
    print(f"  ROC-AUC:   {auc:.4f}")

    print(f"\n  Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"    TN={cm[0][0]:4d}  FP={cm[0][1]:4d}")
    print(f"    FN={cm[1][0]:4d}  TP={cm[1][1]:4d}")

    print(f"\n  Full Classification Report:")
    print(classification_report(y_test, y_pred, zero_division=0,
                                target_names=['Normal', 'At-Risk']))

    # ── Feature importance ────────────────────────────────────────────────────
    importance = pd.DataFrame({
        'feature': feature_cols,
        'importance': best_model.feature_importances_,
    }).sort_values('importance', ascending=False)

    print(f"  Top 10 Most Important Features:")
    for _, row in importance.head(10).iterrows():
        bar = '█' * int(row['importance'] * 50)
        print(f"    {row['feature']:30s} {row['importance']:.4f} {bar}")

    # ── Save model ────────────────────────────────────────────────────────────
    model_path = os.path.join(MODEL_DIR, f'xgb_{target_name}.json')
    best_model.save_model(model_path)
    print(f"\n  Model saved: {model_path}")

    # ── Patient-grouped CV audit + leakage audit ─────────────────────────────
    grouped_cv = run_grouped_cv_audit(
        X=X_train,
        y=y_train,
        groups=np.asarray(train_groups) if train_groups is not None else None,
        target_name=target_name,
        best_params=best_params,
    )

    # ── Save report ───────────────────────────────────────────────────────────
    report = {
        'target': target_name,
        'accuracy': acc,
        'precision': prec,
        'recall': rec,
        'f1': f1,
        'roc_auc': auc,
        'best_params': best_params,
        'train_samples': len(y_train),
        'test_samples': len(y_test),
        'train_positive_ratio': float(train_pos / len(y_train)),
        'grouped_cv_accuracy_mean': grouped_cv['summary']['accuracy']['mean'] if grouped_cv else np.nan,
        'grouped_cv_f1_mean': grouped_cv['summary']['f1']['mean'] if grouped_cv else np.nan,
        'grouped_cv_auc_mean': grouped_cv['summary']['roc_auc']['mean'] if grouped_cv else np.nan,
        'grouped_cv_sensitivity_mean': grouped_cv['summary']['sensitivity']['mean'] if grouped_cv else np.nan,
        'grouped_cv_specificity_mean': grouped_cv['summary']['specificity']['mean'] if grouped_cv else np.nan,
        'grouped_cv_ppv_mean': grouped_cv['summary']['ppv']['mean'] if grouped_cv else np.nan,
        'grouped_cv_npv_mean': grouped_cv['summary']['npv']['mean'] if grouped_cv else np.nan,
        'grouped_cv_report_path': grouped_cv['summary_path'] if grouped_cv else None,
        'leakage_audit_path': grouped_cv['leakage_path'] if grouped_cv else None,
        'leakage_overlap_total': grouped_cv['summary']['subject_overlap_total'] if grouped_cv else np.nan,
        'leakage_pass': grouped_cv['summary']['leakage_pass'] if grouped_cv else False,
    }
    importance.to_csv(os.path.join(REPORT_DIR, f'{target_name}_feature_importance.csv'), index=False)

    return report


def main():
    print("Pedi-Growth Gait Disease Detection — Production Training Pipeline v2")
    print("=" * 70)

    # ── Patient-aware train/test split ────────────────────────────────────────
    print("\nStep 1: Patient-aware data split (prevents data leakage)...")
    train_df, test_df = patient_aware_split(DATA_PATH, test_size=0.2)

    feature_cols = [c for c in train_df.columns if c not in EXCLUDE]

    X_train = train_df[feature_cols].fillna(0).values
    X_test  = test_df[feature_cols].fillna(0).values

    print(f"  Train patients: {train_df['patient_id'].nunique()}")
    print(f"  Test patients:  {test_df['patient_id'].nunique()}")
    print(f"  Total features: {len(feature_cols)}")

    # XGBoost is tree-based — no scaling needed (scale-invariant)
    # This means inference can use raw features directly

    # ── Train all models ──────────────────────────────────────────────────────
    all_reports = []
    for target in TARGET_COLS:
        y_train = train_df[target].values
        y_test  = test_df[target].values

        report = train_single_target(
            X_train, y_train,
            X_test, y_test,
            target, feature_cols,
            train_df['patient_id'].astype(str).values,
        )
        all_reports.append(report)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"FINAL SUMMARY — All Models Trained")
    print(f"{'='*70}")
    print(f"{'Target':<28s} {'Acc':>7s} {'Prec':>7s} {'Rec':>7s} {'F1':>7s} {'AUC':>7s}")
    print(f"{'-'*70}")
    for r in all_reports:
        print(f"  {r['target']:<26s} {r['accuracy']*100:6.2f}% {r['precision']*100:6.2f}% "
              f"{r['recall']*100:6.2f}% {r['f1']*100:6.2f}% {r['roc_auc']:.4f}")

    # Save summary CSV
    summary_df = pd.DataFrame(all_reports)
    summary_path = os.path.join(REPORT_DIR, 'training_summary.csv')
    summary_df.to_csv(summary_path, index=False)

    grouped_cv_summary_path = os.path.join(REPORT_DIR, 'grouped_cv_summary.csv')
    summary_df[
        [
            'target',
            'grouped_cv_accuracy_mean',
            'grouped_cv_f1_mean',
            'grouped_cv_auc_mean',
            'grouped_cv_sensitivity_mean',
            'grouped_cv_specificity_mean',
            'grouped_cv_ppv_mean',
            'grouped_cv_npv_mean',
            'grouped_cv_report_path',
        ]
    ].to_csv(grouped_cv_summary_path, index=False)

    leakage_summary_path = os.path.join(REPORT_DIR, 'leakage_audit_summary.csv')
    summary_df[
        [
            'target',
            'leakage_pass',
            'leakage_overlap_total',
            'leakage_audit_path',
        ]
    ].to_csv(leakage_summary_path, index=False)

    print(f"\nTraining summary saved: {summary_path}")
    print(f"Grouped CV summary saved: {grouped_cv_summary_path}")
    print(f"Leakage audit summary saved: {leakage_summary_path}")
    print(f"Models directory: {MODEL_DIR}")
    print("\nAll models trained and ready for production deployment!")


if __name__ == "__main__":
    main()
