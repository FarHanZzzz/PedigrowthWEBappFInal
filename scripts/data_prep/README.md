# Data Preparation Scripts

These scripts are used for one-time data preparation before model training.
They process raw pose estimation data into flat CSV format suitable for the
XGBoost training pipeline.

## Scripts

### `gait_cleaner.py`
Processes AlphaPose JSON output files and extracts gait metrics per trial.

```bash
python scripts/data_prep/gait_cleaner.py \
  --input-dir /path/to/pose \
  --output data/filtered_gait_dataset.csv
```

### `compact_dataset.py`
Merges filtered gait data with patient demographics into a compact training dataset.

```bash
python scripts/data_prep/compact_dataset.py \
  --gait-csv data/filtered_gait_dataset.csv \
  --patients-csv /path/to/patients_measures.csv \
  --output data/hackathon_model_dataset.csv
```

## Workflow

1. Run `gait_cleaner.py` on raw AlphaPose output
2. Run `compact_dataset.py` to merge with patient demographics
3. Use the output CSV with `scripts/train_xgboost.py` for model training
