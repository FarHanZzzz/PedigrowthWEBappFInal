from __future__ import annotations

import argparse

import uvicorn

from gait_pipeline.api import build_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve deterministic gait API")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--config", default=None, help="Optional YAML config path")
    parser.add_argument("--failure-log", default=None, help="Optional API failure log path")
    args = parser.parse_args()

    app = build_app(config_path=args.config, failure_log_path=args.failure_log)
    uvicorn.run(app, host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
