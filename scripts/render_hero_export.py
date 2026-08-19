#!/usr/bin/env python3

import argparse
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
    run,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Render a clean annotated Pedi-Growth hero export.")
    parser.add_argument("--video", required=True, help="Source video path")
    parser.add_argument("--trace", required=True, help="Analysis trace JSON path")
    parser.add_argument("--output", required=True, help="Output MP4 path")
    return parser.parse_args()


def main():
    args = parse_args()
    video_path = Path(args.video)
    trace_path = Path(args.trace)
    output_path = Path(args.output)

    video_meta = ffprobe_video(video_path)
    trace = load_trace(trace_path)

    with tempfile.TemporaryDirectory(prefix="Pedi-Growth-export-") as temp_dir:
        raw_dir = ensure_clean_dir(Path(temp_dir) / "raw")
        rendered_dir = ensure_clean_dir(Path(temp_dir) / "rendered")

        extract_frames(video_path, raw_dir)
        frame_paths = list_frame_paths(raw_dir)
        fps = video_meta["fps"] or 30

        for index, frame_path in enumerate(frame_paths):
            timestamp_ms = (index / fps) * 1000
            current_frame, _, trace_index = pick_trace_frame(trace, timestamp_ms)
            if current_frame is None:
                image = Image.open(frame_path)
                image.save(rendered_dir / frame_path.name)
                continue

            history_start = max(0, trace_index - 8)
            history = trace["frames"][history_start: trace_index + 1]
            image = Image.open(frame_path).convert("RGBA")
            rendered = render_clean_overlay(image, trace, current_frame, history, timestamp_ms)
            rendered.save(rendered_dir / frame_path.name)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        run([
            "ffmpeg",
            "-y",
            "-framerate",
            str(fps),
            "-i",
            str(rendered_dir / "frame_%06d.png"),
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(output_path),
        ])


if __name__ == "__main__":
    main()
