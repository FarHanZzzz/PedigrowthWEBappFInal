#!/usr/bin/env python3

import json
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


LEFT_COLOR = (59, 130, 246, 255)
RIGHT_COLOR = (239, 68, 68, 255)
HIP_COLOR = (251, 191, 36, 255)
SHOULDER_COLOR = (34, 211, 238, 255)
MIDLINE_COLOR = (255, 255, 255, 180)
PATH_COLOR = (34, 197, 94, 160)
SUBJECT_COLOR = (255, 255, 255, 110)


def run(command):
    subprocess.run(command, check=True)


def ffprobe_video(video_path):
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,duration",
        "-of",
        "json",
        str(video_path),
    ]
    payload = json.loads(subprocess.check_output(command, text=True))
    stream = payload["streams"][0]
    fps = float(Fraction(stream.get("avg_frame_rate", "0/1")))
    if fps <= 0:
        fps = float(Fraction(stream.get("r_frame_rate", "0/1")))
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": fps,
        "duration_seconds": float(stream.get("duration", 0)),
        "total_frames": int(stream.get("nb_frames") or 0),
    }


def ensure_clean_dir(path):
    path = Path(path)
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def extract_frames(video_path, frames_dir):
    run([
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        str(Path(frames_dir) / "frame_%06d.png"),
    ])


def load_trace(trace_path):
    with open(trace_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def list_frame_paths(frames_dir):
    return sorted(Path(frames_dir).glob("frame_*.png"))


def pick_trace_frame(trace, timestamp_ms):
    frames = trace.get("frames", [])
    if not frames:
        return None, 0, None
    closest = min(frames, key=lambda frame: abs(frame["timestampMs"] - timestamp_ms))
    drift_ms = abs(closest["timestampMs"] - timestamp_ms)
    index = frames.index(closest)
    return closest, drift_ms, index


def normalized_point(point, width, height):
    if not point:
        return None
    return point["x"] * width, point["y"] * height


def draw_chain(draw, frame, names, color, width_px, height_px):
    points = []
    for name in names:
        point = frame.get(name)
        pixel = normalized_point(point, width_px, height_px)
        if pixel:
            points.append(pixel)

    if len(points) < 2:
        return

    draw.line(points, fill=color, width=5)
    for x, y in points:
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=color)


def draw_subject_cue(draw, frame, width_px, height_px):
    tracked = []
    for name in [
        "leftShoulder",
        "rightShoulder",
        "leftHip",
        "rightHip",
        "leftKnee",
        "rightKnee",
        "leftAnkle",
        "rightAnkle",
    ]:
        pixel = normalized_point(frame.get(name), width_px, height_px)
        if pixel:
            tracked.append(pixel)

    if len(tracked) < 4:
        return

    xs = [point[0] for point in tracked]
    ys = [point[1] for point in tracked]
    pad_x = 18
    pad_y = 16
    draw.rounded_rectangle(
        (min(xs) - pad_x, min(ys) - pad_y, max(xs) + pad_x, max(ys) + pad_y),
        radius=18,
        outline=SUBJECT_COLOR,
        width=2,
    )


def draw_path_corridor(draw, history, width_px, height_px):
    points = []
    for entry in history:
        hip = entry.get("hipMidpoint")
        pixel = normalized_point(hip, width_px, height_px)
        if pixel:
            points.append(pixel)

    if len(points) < 2:
        return

    draw.line(points, fill=PATH_COLOR, width=4)


def draw_measure_lines(draw, frame, width_px, height_px):
    shoulder_points = [
        normalized_point(frame.get("leftShoulder"), width_px, height_px),
        normalized_point(frame.get("rightShoulder"), width_px, height_px),
    ]
    hip_points = [
        normalized_point(frame.get("leftHip"), width_px, height_px),
        normalized_point(frame.get("rightHip"), width_px, height_px),
    ]

    if all(shoulder_points):
        draw.line(shoulder_points, fill=SHOULDER_COLOR, width=3)
    if all(hip_points):
        draw.line(hip_points, fill=HIP_COLOR, width=3)

    nose = next((landmark for landmark in frame.get("landmarks", []) if landmark.get("name") == "nose"), None)
    hip_mid = frame.get("hipMidpoint")
    nose_px = normalized_point(nose, width_px, height_px) if nose else None
    hip_px = normalized_point(hip_mid, width_px, height_px)
    if nose_px and hip_px:
        draw.line((nose_px, hip_px), fill=MIDLINE_COLOR, width=2)


def draw_pelvis(draw, frame, width_px, height_px):
    pixel = normalized_point(frame.get("hipMidpoint"), width_px, height_px)
    if not pixel:
        return
    x, y = pixel
    draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 255, 255, 255))
    draw.ellipse((x - 8, y - 8, x + 8, y + 8), outline=(0, 0, 0, 120), width=2)


def draw_ankle_trails(draw, history, width_px, height_px):
    if len(history) < 2:
        return
    for side, color in [("leftAnkle", LEFT_COLOR), ("rightAnkle", RIGHT_COLOR)]:
        trail = []
        for frame in history[-8:]:
            pixel = normalized_point(frame.get(side), width_px, height_px)
            if pixel:
                trail.append(pixel)
        if len(trail) >= 2:
            draw.line(trail, fill=color[:3] + (140,), width=3)


def draw_step_marker(draw, trace, current_frame, timestamp_ms, width_px, height_px):
    events = trace.get("stepEvents", [])
    fps = trace.get("videoMeta", {}).get("fps") or 30
    window_ms = 1000 / max(fps, 1)
    matching = [
        event for event in events
        if abs(event["timestampMs"] - timestamp_ms) <= window_ms
    ]
    if not matching:
        return

    event = matching[0]
    ankle_name = "leftAnkle" if event["side"] == "left" else "rightAnkle"
    point = normalized_point(current_frame.get(ankle_name), width_px, height_px)
    if not point:
        return

    x, y = point
    label = "L" if event["side"] == "left" else "R"
    color = LEFT_COLOR if event["side"] == "left" else RIGHT_COLOR
    pill = (x - 13, y - 34, x + 13, y - 16)
    draw.rounded_rectangle(pill, radius=9, fill=color, outline=(255, 255, 255, 90), width=1)
    draw.text((x, y - 25), label, fill=(255, 255, 255, 255), anchor="mm", font=ImageFont.load_default())


def draw_status_legend(draw, trace, current_frame, timestamp_ms, width_px):
    run = trace.get("run", {})
    direction = trace.get("pipeline", {}).get("direction", "unknown")
    quality = current_frame.get("bodyVisibility", 0)
    event = next((item for item in trace.get("stepEvents", []) if item["frameIndex"] == current_frame["frameIndex"]), None)

    labels = [
        "REAL ANALYSIS" if run.get("classification") == "real_analysis" else str(run.get("classification", "unknown")).upper(),
        f"Direction: {direction}",
        f"Tracking: {'High' if quality >= 0.7 else 'Medium' if quality >= 0.4 else 'Low'}",
        f"Event: {('L-step' if event['side'] == 'left' else 'R-step') if event else 'Tracking'}",
    ]

    font = ImageFont.load_default()
    x = 16
    y = 16
    for label in labels:
        bbox = draw.textbbox((0, 0), label, font=font)
        width = bbox[2] - bbox[0]
        draw.rounded_rectangle((x, y, x + width + 12, y + 18), radius=9, fill=(0, 0, 0, 155))
        draw.text((x + 6, y + 4), label, fill=(255, 255, 255, 255), font=font)
        x += width + 18
        if x > width_px - 150:
            x = 16
            y += 24


def render_clean_overlay(image, trace, current_frame, trace_history, timestamp_ms):
    width_px, height_px = image.size
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    draw_path_corridor(draw, trace_history, width_px, height_px)
    draw_subject_cue(draw, current_frame, width_px, height_px)
    draw_measure_lines(draw, current_frame, width_px, height_px)
    draw_chain(draw, current_frame, ["leftHip", "leftKnee", "leftAnkle"], LEFT_COLOR, width_px, height_px)
    draw_chain(draw, current_frame, ["rightHip", "rightKnee", "rightAnkle"], RIGHT_COLOR, width_px, height_px)
    draw_pelvis(draw, current_frame, width_px, height_px)
    draw_ankle_trails(draw, trace_history, width_px, height_px)
    draw_step_marker(draw, trace, current_frame, timestamp_ms, width_px, height_px)
    draw_status_legend(draw, trace, current_frame, timestamp_ms, width_px)

    return Image.alpha_composite(image.convert("RGBA"), overlay)
