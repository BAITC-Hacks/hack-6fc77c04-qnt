"""LOCAL QA ONLY: real catalog + injected delays/errors, never calls OpenAI.

python backend/scripts/ui_probe.py --mode race --port 8002
Modes are explicit, not a production fallback. This script is not in the image.
"""
import argparse
import asyncio
import json
from pathlib import Path
import sys

import uvicorn
from fastapi.responses import JSONResponse, PlainTextResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import create_app


class NoAI:
    async def enrich(self, result, request, selected):
        return


def make_probe(mode):
    app = create_app(selector=NoAI())
    @app.middleware("http")
    async def faults(request, call_next):
        if request.url.path == "/api/match":
            if mode == "503":
                return JSONResponse(status_code=503, content={"error": {"code": "service_unavailable", "message": "Тестовая недоступность сервиса"}})
            if mode == "invalid-json":
                return PlainTextResponse("QA-only invalid JSON", status_code=502)
            if mode == "timeout":
                await asyncio.sleep(13)
            if mode == "race":
                body = json.loads(await request.body())
                await asyncio.sleep(4 if body.get("budget_kzt", 0) >= 1000000 else 0.1)
        return await call_next(request)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", required=True, choices=["race", "503", "invalid-json", "timeout"])
    parser.add_argument("--port", type=int, default=8002)
    args = parser.parse_args()
    print("LOCAL QA MODE:", args.mode, "No AI requests. Not a production server.", flush=True)
    uvicorn.run(make_probe(args.mode), host="127.0.0.1", port=args.port)
