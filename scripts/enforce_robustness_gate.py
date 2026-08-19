from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


DEFAULT_THRESHOLDS = {
    "max_detection_rate_drop": 0.08,
    "max_stability_score_drop": 0.10,
    "max_agreement_proxy_drop": 0.10,
    "max_suppression_ratio_increase": 0.08,
}

DEFAULT_STATUS_POLICY = {
    "require_ok": True,
    "allow_failed_scenarios": [],
}

DEFAULT_COVERAGE_POLICY = {
    "require_all_current_scenarios": True,
    "allow_missing_baseline_scenarios": [],
}


def _read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _scenario_map(summary: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for item in summary.get("scenarios", []):
        name = str(item.get("name", ""))
        if not name:
            continue
        out[name] = item
    return out


def _scenario_thresholds(thresholds: Dict[str, Any], scenario_name: str) -> Dict[str, float]:
    merged = dict(DEFAULT_THRESHOLDS)
    merged.update(thresholds.get("default", {}))
    merged.update(thresholds.get("scenarios", {}).get(scenario_name, {}))
    return merged


def _status_policy(thresholds: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(DEFAULT_STATUS_POLICY)
    merged.update(thresholds.get("status_policy", {}))
    merged["allow_failed_scenarios"] = [str(x) for x in merged.get("allow_failed_scenarios", [])]
    merged["require_ok"] = bool(merged.get("require_ok", True))
    return merged


def _coverage_policy(thresholds: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(DEFAULT_COVERAGE_POLICY)
    merged.update(thresholds.get("coverage_policy", {}))
    merged["require_all_current_scenarios"] = bool(merged.get("require_all_current_scenarios", True))
    merged["allow_missing_baseline_scenarios"] = [
        str(x) for x in merged.get("allow_missing_baseline_scenarios", [])
    ]
    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description="Fail release when robustness benchmark degrades beyond tolerance")
    parser.add_argument("--current", required=True, help="Current benchmark_summary.json")
    parser.add_argument("--baseline", required=True, help="Baseline benchmark_summary.json")
    parser.add_argument("--thresholds", default="data/robustness/robustness_gate_thresholds.json", help="Threshold configuration JSON")
    parser.add_argument("--report", default="outputs/robustness_benchmark/gate_report.json", help="Output gate report path")
    args = parser.parse_args()

    current = _read_json(Path(args.current))
    baseline = _read_json(Path(args.baseline))
    thresholds = _read_json(Path(args.thresholds)) if Path(args.thresholds).exists() else {"default": DEFAULT_THRESHOLDS}
    status_policy = _status_policy(thresholds)
    coverage_policy = _coverage_policy(thresholds)

    current_map = _scenario_map(current)
    baseline_map = _scenario_map(baseline)

    compared = sorted(set(current_map.keys()) & set(baseline_map.keys()))
    if not compared:
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "all_pass": False,
            "reason": "No overlapping scenarios between current and baseline summaries",
            "checks": [],
        }
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        sys.exit(1)

    checks = []
    all_pass = True

    if coverage_policy["require_all_current_scenarios"]:
        allowed_missing = set(coverage_policy["allow_missing_baseline_scenarios"])
        missing_from_baseline = sorted(
            scenario
            for scenario in current_map.keys()
            if scenario not in baseline_map and scenario not in allowed_missing
        )
        if missing_from_baseline:
            all_pass = False
            for scenario_name in missing_from_baseline:
                checks.append(
                    {
                        "scenario": scenario_name,
                        "pass": False,
                        "reason": "missing_baseline_scenario",
                        "coverage_policy": coverage_policy,
                    }
                )

    for scenario_name in compared:
        current_item = current_map[scenario_name]
        baseline_item = baseline_map[scenario_name]

        current_metrics = current_item.get("metrics", {})
        baseline_metrics = baseline_item.get("metrics", {})
        current_status = str(current_item.get("status", "unknown"))
        baseline_status = str(baseline_item.get("status", "unknown"))
        limits = _scenario_thresholds(thresholds, scenario_name)

        status_pass = True
        status_reason = None
        if status_policy["require_ok"] and scenario_name not in status_policy["allow_failed_scenarios"]:
            if baseline_status != "ok":
                status_pass = False
                status_reason = f"baseline_status_not_ok({baseline_status})"
            elif current_status != "ok":
                status_pass = False
                status_reason = f"current_status_not_ok({current_status})"

        cur_det = float(current_metrics.get("detection_rate", 0.0))
        base_det = float(baseline_metrics.get("detection_rate", 0.0))
        cur_stab = float(current_metrics.get("stability_score", 0.0))
        base_stab = float(baseline_metrics.get("stability_score", 0.0))
        cur_agree = float(current_metrics.get("clinician_agreement_proxy", 0.0))
        base_agree = float(baseline_metrics.get("clinician_agreement_proxy", 0.0))
        cur_suppress = float(current_metrics.get("suppression_ratio", 1.0))
        base_suppress = float(baseline_metrics.get("suppression_ratio", 1.0))

        det_drop = base_det - cur_det
        stab_drop = base_stab - cur_stab
        agree_drop = base_agree - cur_agree
        suppress_increase = cur_suppress - base_suppress

        scenario_pass = (
            det_drop <= float(limits["max_detection_rate_drop"])
            and stab_drop <= float(limits["max_stability_score_drop"])
            and agree_drop <= float(limits["max_agreement_proxy_drop"])
            and suppress_increase <= float(limits["max_suppression_ratio_increase"])
            and status_pass
        )

        checks.append(
            {
                "scenario": scenario_name,
                "pass": scenario_pass,
                "degradation": {
                    "detection_rate_drop": det_drop,
                    "stability_score_drop": stab_drop,
                    "clinician_agreement_proxy_drop": agree_drop,
                    "suppression_ratio_increase": suppress_increase,
                },
                "limits": limits,
                "status_policy": status_policy,
                "status_check": {
                    "pass": status_pass,
                    "reason": status_reason,
                    "current_status": current_status,
                    "baseline_status": baseline_status,
                },
                "current": {
                    "detection_rate": cur_det,
                    "stability_score": cur_stab,
                    "clinician_agreement_proxy": cur_agree,
                    "suppression_ratio": cur_suppress,
                    "status": current_status,
                },
                "baseline": {
                    "detection_rate": base_det,
                    "stability_score": base_stab,
                    "clinician_agreement_proxy": base_agree,
                    "suppression_ratio": base_suppress,
                    "status": baseline_status,
                },
            }
        )

        all_pass = all_pass and scenario_pass

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "all_pass": all_pass,
        "checked_scenarios": compared,
        "coverage_policy": coverage_policy,
        "checks": checks,
    }

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
