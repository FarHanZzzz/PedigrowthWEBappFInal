from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd


def _check(name: str, passed: bool, value: Any, target: str, note: str | None = None) -> Dict[str, Any]:
    return {
        "name": name,
        "pass": bool(passed),
        "value": value,
        "target": target,
        "note": note or "",
    }


def _read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Strict dataset/model readiness auditor")
    parser.add_argument("--features", required=True, help="Path to scalar_features.parquet")
    parser.add_argument("--output", required=True, help="Path to write gate report JSON")
    parser.add_argument("--manifest", default="data/manifest.csv", help="Path to manifest CSV/Parquet")
    parser.add_argument("--discarded", default=None, help="Optional path to discarded_trials.csv")
    parser.add_argument("--split-features", default=None, help="Optional path to features_with_split.parquet")
    parser.add_argument("--model-reports", default=None, help="Optional path to model_reports.json")
    parser.add_argument("--feature-importance", default=None, help="Optional path to feature_importance.csv")
    parser.add_argument("--min-cp-samples", type=int, default=20)
    parser.add_argument("--min-td-samples", type=int, default=20)
    parser.add_argument("--min-kept-trials", type=int, default=40)
    parser.add_argument("--min-quality", type=float, default=0.70)
    parser.add_argument("--max-discard-rate", type=float, default=0.50)
    parser.add_argument("--min-accuracy", type=float, default=0.60)
    parser.add_argument("--min-test-support", type=int, default=5)
    parser.add_argument("--max-synthetic-ratio", type=float, default=0.20)
    args = parser.parse_args()

    features_path = Path(args.features)
    output_path = Path(args.output)
    base_dir = features_path.parent

    manifest_path = Path(args.manifest)
    discarded_path = Path(args.discarded) if args.discarded else base_dir / "discarded_trials.csv"
    split_path = Path(args.split_features) if args.split_features else base_dir / "features_with_split.parquet"
    reports_path = Path(args.model_reports) if args.model_reports else base_dir / "model_reports.json"
    importance_path = Path(args.feature_importance) if args.feature_importance else base_dir / "feature_importance.csv"

    features_df = pd.read_parquet(features_path)

    checks: List[Dict[str, Any]] = []

    cp_count = int((features_df["condition"].astype(str).str.upper() == "CP").sum())
    td_count = int((features_df["condition"].astype(str).str.upper() == "TD").sum())
    kept_trials = int(len(features_df))
    age_ok = bool(pd.to_numeric(features_df["age_months"], errors="coerce").between(36, 216).all())
    mean_quality = float(pd.to_numeric(features_df["quality_score"], errors="coerce").mean())

    checks.append(_check("cp_samples", cp_count >= args.min_cp_samples, cp_count, f">= {args.min_cp_samples}"))
    checks.append(_check("td_samples", td_count >= args.min_td_samples, td_count, f">= {args.min_td_samples}"))
    checks.append(_check("kept_trials", kept_trials >= args.min_kept_trials, kept_trials, f">= {args.min_kept_trials}"))
    checks.append(_check("age_range_36_to_216", age_ok, age_ok, "True"))
    checks.append(_check("mean_quality", mean_quality >= args.min_quality, round(mean_quality, 6), f">= {args.min_quality}"))

    if manifest_path.exists():
        if manifest_path.suffix.lower() == ".parquet":
            manifest_df = pd.read_parquet(manifest_path)
        else:
            manifest_df = pd.read_csv(manifest_path)

        manifest_rows = int(len(manifest_df))
        synthetic_ratio = float(
            manifest_df["trial_path"].astype(str).str.contains(r"synthetic|outputs/synthetic_demo", case=False, regex=True).mean()
        )
        checks.append(
            _check(
                "synthetic_ratio",
                synthetic_ratio <= args.max_synthetic_ratio,
                round(synthetic_ratio, 6),
                f"<= {args.max_synthetic_ratio}",
                "Lower is better for real-world readiness.",
            )
        )
    else:
        manifest_rows = None
        checks.append(_check("manifest_present", False, False, "True", f"Missing file: {manifest_path}"))

    if discarded_path.exists() and manifest_rows:
        discarded_df = pd.read_csv(discarded_path)
        discard_rate = float(len(discarded_df) / max(1, manifest_rows))
        checks.append(_check("discard_rate", discard_rate <= args.max_discard_rate, round(discard_rate, 6), f"<= {args.max_discard_rate}"))
    else:
        checks.append(_check("discard_rate_computable", False, False, "True", f"Need {discarded_path} and manifest rows"))

    if split_path.exists():
        split_df = pd.read_parquet(split_path)
        train_subjects = set(split_df[split_df["split"] == "train"]["subject_id"].astype(str))
        val_subjects = set(split_df[split_df["split"] == "val"]["subject_id"].astype(str))
        test_subjects = set(split_df[split_df["split"] == "test"]["subject_id"].astype(str))
        overlap = len(train_subjects & val_subjects) + len(train_subjects & test_subjects) + len(val_subjects & test_subjects)
        checks.append(_check("subject_split_leakage", overlap == 0, overlap, "0 overlaps"))
    else:
        checks.append(_check("split_features_present", False, False, "True", f"Missing file: {split_path}"))

    if reports_path.exists():
        reports = _read_json(reports_path)
        val_accuracy = float(reports.get("validation", {}).get("accuracy", 0.0))
        test_accuracy = float(reports.get("test", {}).get("accuracy", 0.0))
        test_support = int(float(reports.get("test", {}).get("weighted avg", {}).get("support", 0.0)))
        checks.append(_check("validation_accuracy", val_accuracy >= args.min_accuracy, round(val_accuracy, 6), f">= {args.min_accuracy}"))
        checks.append(_check("test_accuracy", test_accuracy >= args.min_accuracy, round(test_accuracy, 6), f">= {args.min_accuracy}"))
        checks.append(_check("test_support", test_support >= args.min_test_support, test_support, f">= {args.min_test_support}"))
    else:
        checks.append(_check("model_reports_present", False, False, "True", f"Missing file: {reports_path}"))

    if importance_path.exists():
        importance_df = pd.read_csv(importance_path)
        nonzero = int((pd.to_numeric(importance_df["importance"], errors="coerce") > 1e-12).sum())
        checks.append(_check("feature_importance_signal", nonzero >= 1, nonzero, ">= 1 non-zero feature"))
    else:
        checks.append(_check("feature_importance_present", False, False, "True", f"Missing file: {importance_path}"))

    all_pass = all(check["pass"] for check in checks)

    recommendations: List[str] = []
    failed_names = {check["name"] for check in checks if not check["pass"]}
    if "cp_samples" in failed_names or "td_samples" in failed_names or "kept_trials" in failed_names:
        recommendations.append("Increase real CP/TD trial counts; current cohort is too small for reliable training.")
    if "synthetic_ratio" in failed_names:
        recommendations.append("Reduce synthetic trials in manifest and replace with real recordings.")
    if "test_accuracy" in failed_names or "validation_accuracy" in failed_names or "test_support" in failed_names:
        recommendations.append("Do not trust model metrics yet; expand dataset and re-evaluate with larger test support.")
    if "feature_importance_signal" in failed_names:
        recommendations.append("Feature importances are flat; verify training signal after adding real data and class diversity.")
    if "discard_rate" in failed_names:
        recommendations.append("High discard rate suggests capture quality issues or over-strict thresholds; inspect failure reasons.")

    summary = {
        "all_pass": all_pass,
        "checks": checks,
        "counts": {
            "cp_samples": cp_count,
            "td_samples": td_count,
            "kept_trials": kept_trials,
            "manifest_rows": manifest_rows,
        },
        "recommendations": recommendations,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
