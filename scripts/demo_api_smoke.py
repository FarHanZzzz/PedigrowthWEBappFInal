#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from fastapi.testclient import TestClient

from gait_pipeline.api import build_app


def main() -> int:
    parser = argparse.ArgumentParser(description="Run judge-facing API smoke checks")
    parser.add_argument("--trial-path", required=True, help="Path to an existing trial for analyze-trial")
    parser.add_argument("--trial-format", default="csv")
    parser.add_argument("--source-joint-set", default="coco17")
    parser.add_argument("--sampling-rate", type=int, default=30)
    parser.add_argument("--age-months", type=float, default=96.0)
    parser.add_argument("--condition", default="TD")
    parser.add_argument("--severity", type=int, default=0)
    parser.add_argument("--output", default="outputs/hsil_demo/demo_api_smoke.json")
    parser.add_argument("--config", default="gait_pipeline/pipeline_config.yaml")
    args = parser.parse_args()

    trial_path = Path(args.trial_path)
    if not trial_path.exists():
        raise FileNotFoundError(f"Trial file not found: {trial_path}")

    app = build_app(config_path=args.config)
    client = TestClient(app)

    preflight_invalid = {
        "filename": trial_path.name,
        "content_type": "video/mp4",
        "size_bytes": 1024,
        "age_months": 12,
        "condition": args.condition,
        "severity": args.severity,
    }
    preflight_ok = {
        "filename": trial_path.name,
        "content_type": "video/mp4",
        "size_bytes": 1024,
        "age_months": args.age_months,
        "condition": args.condition,
        "severity": args.severity,
    }

    analyze_payload: Dict[str, Any] = {
        "trial_path": str(trial_path),
        "trial_format": args.trial_format,
        "source_joint_set": args.source_joint_set,
        "subject_id": "DEMO_001",
        "age_months": args.age_months,
        "condition": args.condition,
        "severity": args.severity,
        "sampling_rate": args.sampling_rate,
        "metadata": {"height_cm": 130.0, "weight_kg": 30.0, "device": "demo"},
    }

    invalid_resp = client.post("/preflight-upload", json=preflight_invalid)
    ok_resp = client.post("/preflight-upload", json=preflight_ok)
    analyze_resp = client.post("/analyze-trial", json=analyze_payload)

    result = {
        "preflight_invalid": {
            "status_code": invalid_resp.status_code,
            "body": invalid_resp.json(),
        },
        "preflight_valid": {
            "status_code": ok_resp.status_code,
            "body": ok_resp.json(),
        },
        "analyze_trial": {
            "status_code": analyze_resp.status_code,
            "body": analyze_resp.json(),
        },
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"\nSaved smoke output to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
