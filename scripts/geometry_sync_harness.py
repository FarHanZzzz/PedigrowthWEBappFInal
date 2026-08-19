#!/usr/bin/env python3

import argparse
import json
import tempfile
from pathlib import Path

from PIL import Image

from hero_overlay_lib import (
    ensure_clean_dir,
    extract_frames,
    ffprobe_video,
    list_frame_paths,
    load_trace,
    pick_trace_frame,
    render_clean_overlay,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Generate an offline geometry/sync report for a Pedi-Growth hero trace.")
    parser.add_argument("--video", required=True, help="Source video path")
    parser.add_argument("--trace", required=True, help="Analysis trace JSON path")
    parser.add_argument("--report", required=True, help="Output report JSON path")
    parser.add_argument("--samples-dir", required=True, help="Directory for rendered sample PNGs")
    parser.add_argument("--sample-count", type=int, default=6, help="Number of evenly spaced sample frames")
    return parser.parse_args()


def main():
    args = parse_args()
    video_path = Path(args.video)
    trace_path = Path(args.trace)
    report_path = Path(args.report)
    samples_dir = ensure_clean_dir(args.samples_dir)

    video_meta = ffprobe_video(video_path)
    trace = load_trace(trace_path)

    with tempfile.TemporaryDirectory(prefix="Pedi-Growth-geometry-") as temp_dir:
        raw_dir = ensure_clean_dir(Path(temp_dir) / "raw")
        extract_frames(video_path, raw_dir)
        frame_paths = list_frame_paths(raw_dir)
        fps = video_meta["fps"] or 30

        if not frame_paths:
            raise RuntimeError("No raw frames were extracted for geometry verification.")

        sample_indices = []
        count = min(args.sample_count, len(frame_paths))
        if count == 1:
            sample_indices = [0]
        else:
            for i in range(count):
                sample_indices.append(round(i * (len(frame_paths) - 1) / (count - 1)))

        samples = []
        max_drift_ms = 0.0
        for index in sample_indices:
            timestamp_ms = (index / fps) * 1000
            current_frame, drift_ms, trace_index = pick_trace_frame(trace, timestamp_ms)
            max_drift_ms = max(max_drift_ms, drift_ms)
            if current_frame is None:
                continue

            history_start = max(0, trace_index - 8)
            history = trace["frames"][history_start: trace_index + 1]
            image = Image.open(frame_paths[index]).convert("RGBA")
            rendered = render_clean_overlay(image, trace, current_frame, history, timestamp_ms)
            sample_name = f"sample_{index + 1:03d}.png"
            rendered.save(samples_dir / sample_name)

            samples.append({
                "videoFrameIndex": index,
                "traceFrameIndex": trace_index,
                "timestampMs": round(timestamp_ms, 2),
                "traceTimestampMs": current_frame["timestampMs"],
                "driftMs": round(drift_ms, 2),
                "sampleImage": str(Path(args.samples_dir) / sample_name),
            })

    report = {
        "status": "generated",
        "videoWidth": video_meta["width"],
        "videoHeight": video_meta["height"],
        "videoFps": video_meta["fps"],
        "videoFrameCount": len(frame_paths),
        "traceFrameCount": len(trace.get("frames", [])),
        "traceFps": trace.get("videoMeta", {}).get("fps"),
        "objectFitMode": "contain",
        "transform": "normalized trace coordinates rendered directly into native video pixels",
        "overlayTimestampSource": "nearest_trace_frame",
        "maxDisplayedFrameDriftEstimate": round(max_drift_ms / (1000 / max(video_meta["fps"], 1)), 3),
        "maxDriftMs": round(max_drift_ms, 2),
        "samples": samples,
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)


if __name__ == "__main__":
    main()
