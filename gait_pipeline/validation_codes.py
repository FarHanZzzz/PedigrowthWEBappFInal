from __future__ import annotations

from typing import Dict, List


ERROR_CODES: Dict[str, str] = {
    "unsupported_file_type": "Only MP4 or QuickTime videos are accepted.",
    "file_too_large": "Video must be under 100 MB.",
    "invalid_age": "Age must be between 3 and 18 years.",
    "invalid_condition": "Condition must be CP or TD.",
    "invalid_severity": "Severity must be 0 to 3.",
}


def summarize_error_codes(codes: List[str]) -> str:
    if not codes:
        return "ok"
    first = codes[0]
    return ERROR_CODES.get(first, "Upload failed preflight validation.")
