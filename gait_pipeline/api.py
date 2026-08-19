from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .cleaning import clean_and_normalize_trial, fill_missing_metadata_with_population_medians
from .config import PipelineConfig, load_config
from .features import extract_core_features
from .io import load_trial_data
from .validation_codes import ERROR_CODES, summarize_error_codes


class TrialRequest(BaseModel):
    trial_path: str
    trial_format: Optional[str] = None
    source_joint_set: Optional[str] = None
    subject_id: str
    age_months: float
    condition: str = Field(pattern="^(CP|TD)$")
    severity: int = Field(ge=0, le=3)
    sampling_rate: int = Field(default=30, gt=0)
    video_path: Optional[str] = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TrialResponse(BaseModel):
    trial_id: str
    subject_id: str
    condition: str
    severity: int
    quality_score: float
    quality_components: Dict[str, float]
    confidence_score: float
    is_valid: bool
    discard_reasons: List[str]
    rejection_reasons: List[str]
    scalar_metrics: Dict[str, float]
    feature_tags: Dict[str, str]
    risk_category: str
    explanation: str
    disclaimer: str


class PreflightRequest(BaseModel):
    filename: str
    content_type: str
    size_bytes: int = Field(gt=0)
    age_months: float
    condition: Optional[str] = None
    severity: Optional[int] = None


class PreflightResponse(BaseModel):
    accepted: bool
    error_codes: List[str]
    message: str
    disclaimer: str


class APIRuntime:
    def __init__(self, config: PipelineConfig, failure_log_path: Path):
        self.config = config
        self.failure_log_path = failure_log_path
        self.failure_log_path.parent.mkdir(parents=True, exist_ok=True)

    def log_failure(self, payload: Dict[str, Any]) -> None:
        with self.failure_log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")


DISCLAIMER_TEXT = "This is a screening support tool, not a diagnostic device."
ALLOWED_MIME_TYPES = {"video/mp4", "video/quicktime"}
MAX_VIDEO_BYTES = 100 * 1024 * 1024
MIN_AGE_MONTHS = 36
MAX_AGE_MONTHS = 216
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


def _allowed_origins_from_env() -> List[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if not raw:
        return list(DEFAULT_ALLOWED_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _run_preflight(req: PreflightRequest) -> PreflightResponse:
    error_codes: List[str] = []
    condition_norm = req.condition.upper() if isinstance(req.condition, str) else None

    if req.content_type.lower() not in ALLOWED_MIME_TYPES:
        error_codes.append("unsupported_file_type")

    if req.size_bytes > MAX_VIDEO_BYTES:
        error_codes.append("file_too_large")

    if not (MIN_AGE_MONTHS <= req.age_months <= MAX_AGE_MONTHS):
        error_codes.append("invalid_age")

    if condition_norm is not None and condition_norm not in {"CP", "TD"}:
        error_codes.append("invalid_condition")

    if req.severity is not None and not (0 <= req.severity <= 3):
        error_codes.append("invalid_severity")

    if condition_norm == "TD" and req.severity not in {None, 0}:
        if "invalid_severity" not in error_codes:
            error_codes.append("invalid_severity")

    return PreflightResponse(
        accepted=len(error_codes) == 0,
        error_codes=error_codes,
        message=summarize_error_codes(error_codes),
        disclaimer=DISCLAIMER_TEXT,
    )


def _with_metric_aliases(metrics: Dict[str, float]) -> Dict[str, float]:
    aliased = dict(metrics)
    alias_map = {
        "step_length": "step_length_mean",
        "stride_length": "stride_length_mean",
        "stride_time": "stride_time_mean",
        "cadence": "cadence_spm",
        "knee_rom": "knee_rom_deg",
        "hip_rom": "hip_rom_deg",
        "ankle_rom": "ankle_rom_deg",
        "symmetry_index": "temporal_asymmetry_index",
    }
    for alias, original in alias_map.items():
        if original in metrics:
            aliased[alias] = metrics[original]
    return aliased


def _derive_rejection_reasons(all_reasons: List[str]) -> List[str]:
    cycle_prefixes = (
        "gait_cycle_validation_failed",
        "no_detectable_gait_cycle",
        "insufficient_gait_cycles",
        "cycle_",
    )
    cycle_reasons = [
        reason for reason in all_reasons if any(reason.startswith(prefix) for prefix in cycle_prefixes)
    ]
    return cycle_reasons if cycle_reasons else all_reasons


def _risk_and_explanation(
    quality_score: float,
    scalar_metrics: Dict[str, float],
    quality_threshold: float,
) -> tuple[str, str]:
    knee_rom = float(scalar_metrics.get("knee_rom_deg", np.nan))
    asym = float(scalar_metrics.get("temporal_asymmetry_index", np.nan))

    risk_points = 0
    if np.isfinite(quality_score) and quality_score < quality_threshold:
        risk_points += 1
    if np.isfinite(knee_rom) and knee_rom < 45.0:
        risk_points += 1
    if np.isfinite(asym) and asym > 0.20:
        risk_points += 1

    if risk_points >= 2:
        risk = "elevated"
    elif risk_points == 1:
        risk = "moderate"
    else:
        risk = "low"

    explanation = (
        "Deterministic screening summary: "
        f"quality_score={quality_score:.2f}, knee_rom_deg={knee_rom:.1f}, "
        f"temporal_asymmetry_index={asym:.2f}. "
        f"Quality risk threshold={quality_threshold:.2f}. "
        "Reduced knee extension range and/or elevated temporal asymmetry increase screening risk."
    )
    return risk, explanation


def build_app(
    config_path: Optional[str | Path] = None,
    failure_log_path: Optional[str | Path] = None,
) -> FastAPI:
    app = FastAPI(title="Pedi-Growth Deterministic Gait API", version="0.1.0")
    allowed_origins = _allowed_origins_from_env()

    # ── CORS: Allow frontend (Next.js) to call this API ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    config = load_config(config_path)
    selected_failure_log = failure_log_path or config.failure_log_path or "outputs/api_failure_log.jsonl"
    runtime = APIRuntime(config, Path(selected_failure_log))

    @app.get("/health")
    def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/validation-codes")
    def validation_codes() -> Dict[str, Dict[str, str]]:
        return {"error_codes": ERROR_CODES}

    @app.post("/preflight-upload", response_model=PreflightResponse)
    def preflight_upload(req: PreflightRequest) -> PreflightResponse:
        return _run_preflight(req)

    @app.post("/analyze-trial", response_model=TrialResponse)
    def analyze_trial(req: TrialRequest) -> TrialResponse:
        try:
            coords, conf, _ = load_trial_data(
                trial_path=req.trial_path,
                trial_format=req.trial_format,
                source_joint_set=req.source_joint_set,
                target_joint_set=runtime.config.target_joint_set,
            )
        except Exception as exc:
            runtime.log_failure(
                {
                    "trial_path": req.trial_path,
                    "subject_id": req.subject_id,
                    "error": f"corrupt_or_unreadable_file: {exc}",
                }
            )
            raise HTTPException(status_code=400, detail=f"Unable to load trial: {exc}") from exc

        population_medians = {
            "height_cm": 140.0,
            "weight_kg": 35.0,
        }
        metadata, warnings = fill_missing_metadata_with_population_medians(
            req.metadata,
            population_medians,
        )

        clean = clean_and_normalize_trial(
            coords=coords,
            confidence=conf,
            sampling_rate=req.sampling_rate,
            metadata=metadata,
            config=runtime.config,
        )

        trial_id = Path(req.trial_path).stem
        all_reasons = list(clean.discard_reasons) + warnings

        if not clean.is_valid:
            rejection_reasons = _derive_rejection_reasons(all_reasons)
            runtime.log_failure(
                {
                    "trial_id": trial_id,
                    "subject_id": req.subject_id,
                    "quality_score": clean.quality_score,
                    "reasons": all_reasons,
                    "trial_path": req.trial_path,
                }
            )
            return TrialResponse(
                trial_id=trial_id,
                subject_id=req.subject_id,
                condition=req.condition,
                severity=req.severity,
                quality_score=clean.quality_score,
                quality_components=clean.quality_components,
                confidence_score=float(clean.quality_components.get("confidence", np.nan)),
                is_valid=False,
                discard_reasons=all_reasons,
                rejection_reasons=rejection_reasons,
                scalar_metrics={},
                feature_tags={},
                risk_category="invalid",
                explanation="Trial did not pass quality gates; no metrics were computed.",
                disclaimer=DISCLAIMER_TEXT,
            )

        features = extract_core_features(
            cleaned_coords=clean.cleaned_coords,
            mean_cycle=clean.mean_cycle,
            heel_strikes=clean.heel_strikes,
            sampling_rate=req.sampling_rate,
        )

        scalar_metrics = _with_metric_aliases(features.scalar_metrics)

        risk_category, explanation = _risk_and_explanation(
            quality_score=clean.quality_score,
            scalar_metrics=scalar_metrics,
            quality_threshold=runtime.config.quality_threshold,
        )

        return TrialResponse(
            trial_id=trial_id,
            subject_id=req.subject_id,
            condition=req.condition,
            severity=req.severity,
            quality_score=clean.quality_score,
            quality_components=clean.quality_components,
            confidence_score=float(clean.quality_components.get("confidence", np.nan)),
            is_valid=True,
            discard_reasons=all_reasons,
            rejection_reasons=[],
            scalar_metrics=scalar_metrics,
            feature_tags=features.feature_tags,
            risk_category=risk_category,
            explanation=explanation,
            disclaimer=DISCLAIMER_TEXT,
        )

    # ── XGBoost prediction from landmarks ──
    @app.post("/predict-from-landmarks")
    def predict_from_landmarks(req: LandmarkPredictRequest) -> Dict[str, Any]:
        """Run XGBoost gait risk prediction from extracted landmark frames."""
        try:
            from .gait_inference import GaitPredictor
            predictor = GaitPredictor()

            frames = []
            for frame in req.frames:
                frames.append({
                    'l_hip': tuple(frame.get('l_hip', [0, 0])),
                    'l_knee': tuple(frame.get('l_knee', [0, 0])),
                    'l_ankle': tuple(frame.get('l_ankle', [0, 0])),
                    'r_hip': tuple(frame.get('r_hip', [0, 0])),
                    'r_knee': tuple(frame.get('r_knee', [0, 0])),
                    'r_ankle': tuple(frame.get('r_ankle', [0, 0])),
                    'l_shoulder': tuple(frame.get('l_shoulder', [0, 0])),
                    'r_shoulder': tuple(frame.get('r_shoulder', [0, 0])),
                })

            patient_info = req.patient_info or {}
            result = predictor.predict_from_landmarks(frames, patient_info)

            if result is None:
                return {
                    'success': False,
                    'error': 'Insufficient landmark data for prediction (need ≥10 frames with visible joints).',
                    'disclaimer': DISCLAIMER_TEXT,
                }

            return {
                'success': True,
                'predictions': result,
                'disclaimer': DISCLAIMER_TEXT,
            }
        except Exception as exc:
            return {
                'success': False,
                'error': f'Prediction failed: {str(exc)}',
                'disclaimer': DISCLAIMER_TEXT,
            }

    return app


class LandmarkPredictRequest(BaseModel):
    """Request body for /predict-from-landmarks."""
    frames: List[Dict[str, Any]] = Field(
        ...,
        description="List of landmark frame dicts with keys like l_hip, r_hip, etc."
    )
    patient_info: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional patient demographics: Sex, Age, Height, Weight, BMI",
    )


app = build_app()
