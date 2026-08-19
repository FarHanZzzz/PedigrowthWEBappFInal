from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


UNIFIED_COLUMNS = [
    "trial_id",
    "subject_id",
    "age_months",
    "condition",
    "severity",
    "sampling_rate",
    "left_right_labels",
    "coordinates_3d",
    "keypoints_2d",
    "video_path",
    "metadata",
    "source_path",
]

DEFAULT_LEFT_RIGHT_LABELS = [
    "left_hip:right_hip",
    "left_knee:right_knee",
    "left_ankle:right_ankle",
    "left_heel:right_heel",
    "left_toe:right_toe",
]


@dataclass
class UnifiedTrial:
    trial_id: str
    subject_id: str
    age_months: float
    condition: str
    severity: int
    sampling_rate: int
    left_right_labels: List[str]
    coordinates_3d: Optional[List[List[List[float]]]]
    keypoints_2d: Optional[List[List[List[float]]]]
    video_path: str
    metadata: Dict[str, Any]
    source_path: str

    def to_record(self) -> Dict[str, Any]:
        return {
            "trial_id": self.trial_id,
            "subject_id": self.subject_id,
            "age_months": float(self.age_months),
            "condition": self.condition,
            "severity": int(self.severity),
            "sampling_rate": int(self.sampling_rate),
            "left_right_labels": self.left_right_labels,
            "coordinates_3d": self.coordinates_3d,
            "keypoints_2d": self.keypoints_2d,
            "video_path": self.video_path,
            "metadata": self.metadata,
            "source_path": self.source_path,
        }


def enforce_condition_and_severity(condition: str, severity: int) -> tuple[str, int]:
    condition_norm = condition.strip().upper()
    if condition_norm not in {"CP", "TD"}:
        raise ValueError(f"Unsupported condition: {condition}")

    if condition_norm == "TD":
        return "TD", 0

    if severity < 0 or severity > 3:
        raise ValueError("CP severity must be in [0, 3]")

    return "CP", severity
