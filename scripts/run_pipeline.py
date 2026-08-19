from __future__ import annotations

import argparse
import json

from gait_pipeline.config import load_config
from gait_pipeline.pipeline import run_end_to_end_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Run deterministic gait pipeline")
    parser.add_argument("--manifest", default=None, help="Path to CSV/Parquet manifest")
    parser.add_argument("--output-dir", default=None, help="Output directory")
    parser.add_argument("--config", default=None, help="Optional YAML config path")
    parser.add_argument(
        "--task",
        default=None,
        choices=["binary", "severity"],
        help="Classifier target",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    manifest = args.manifest or cfg.manifest_path
    output_dir = args.output_dir or cfg.output_dir
    task = args.task or "binary"

    if manifest is None:
        parser.error("Manifest path is required via --manifest or paths.manifest in config")
    if output_dir is None:
        parser.error("Output directory is required via --output-dir or paths.output_dir in config")

    results = run_end_to_end_pipeline(
        manifest_path=manifest,
        output_dir=output_dir,
        config_path=args.config,
        task=task,
    )
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
