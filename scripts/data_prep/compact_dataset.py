"""
PEDI-GROWTH — Compact Dataset Builder
======================================
Merges filtered gait data with patient baseline measures into a compact
dataset suitable for XGBoost model training.

Usage:
  python scripts/data_prep/compact_dataset.py \
    --gait-csv /path/to/filtered_gait_dataset.csv \
    --patients-csv /path/to/patients_measures.csv \
    --output /path/to/hackathon_model_dataset.csv
"""

import argparse
import pandas as pd


def main():
    parser = argparse.ArgumentParser(description="Build compact model training dataset")
    parser.add_argument("--gait-csv", required=True, help="Path to filtered gait dataset CSV")
    parser.add_argument("--patients-csv", required=True, help="Path to patient measures CSV")
    parser.add_argument("--output", default="hackathon_model_dataset.csv", help="Output CSV path")
    args = parser.parse_args()

    gait_df = pd.read_csv(args.gait_csv)
    patients_df = pd.read_csv(args.patients_csv)

    agg_funcs = {
        'L_Knee_ROM': 'mean',
        'R_Knee_ROM': 'mean',
        'Symmetry_Index': 'mean',
        'HIGH_RISK_Asymmetry': 'max',
        'Pelvic_Tilt_Std': 'mean',
        'Orthopedic_Trendelenburg_Alert': 'max',
        'Trunk_Sway_Std': 'mean',
        'DMD_RISK': 'max',
        'Shoulder_Pelvic_Divergence': 'mean',
        'SCOLIOSIS_RISK': 'max',
    }

    gait_grouped = gait_df.groupby('Patient_ID').agg(agg_funcs).reset_index()
    final_df = pd.merge(patients_df, gait_grouped, left_on='ID', right_on='Patient_ID', how='inner')

    columns_to_keep = [
        'ID', 'Sex', 'Age', 'Height', 'Weight', 'BMI',
        'L_Knee_ROM', 'R_Knee_ROM', 'Symmetry_Index', 'HIGH_RISK_Asymmetry',
        'Pelvic_Tilt_Std', 'Orthopedic_Trendelenburg_Alert',
        'Trunk_Sway_Std', 'DMD_RISK',
        'Shoulder_Pelvic_Divergence', 'SCOLIOSIS_RISK',
    ]
    final_df = final_df[columns_to_keep]

    final_df.to_csv(args.output, index=False)
    print(f"Saved compact dataset to {args.output} (Shape: {final_df.shape})")


if __name__ == "__main__":
    main()
