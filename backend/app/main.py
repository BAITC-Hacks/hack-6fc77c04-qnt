from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .budget import CallBudget
from .catalog import Catalog, DEFAULT_DATASET, load_catalog
from .explanations import EvidenceSelector
from .matching import match
from .models import MatchRequest, MatchResponse

ROOT = Path(__file__).resolve().parents[2]


def error_response(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app(dataset_path: Path = DEFAULT_DATASET, *, catalog: Catalog | None = None,
               selector: EvidenceSelector | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        load_dotenv(ROOT / ".env", override=False)
        app.state.catalog = catalog if catalog is not None else load_catalog(dataset_path)
        async with httpx.AsyncClient(follow_redirects=False, trust_env=False) as client:
            app.state.selector = selector or EvidenceSelector(
                client, api_key=os.getenv("OPENAI_API_KEY", ""),
                enabled=os.getenv("ENABLE_AI", "false").lower() == "true",
                model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                budget=CallBudget.from_env(ROOT),
            )
            yield

    app = FastAPI(title="QNT Contractor Match", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware,
                       allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Never echo request bodies or raw exception strings into responses.
        return error_response("validation_error", "Проверьте параметры: справочники, дату 23.09–31.12.2026, положительный целый бюджет и числовую длительность.", 422)

    @app.get("/api/health")
    async def health():
        current = getattr(app.state, "catalog", None)
        if current is None:
            return error_response("service_unavailable", "Каталог пока недоступен", 503)
        return {"status": "ok", "dataset_count": len(current.contractors)}

    @app.get("/api/options")
    async def options():
        return app.state.catalog.options

    @app.post("/api/match", response_model=MatchResponse)
    async def match_endpoint(request: MatchRequest):
        try:
            result, selected = match(request, app.state.catalog)
        except ValueError as exc:
            return error_response("validation_error", str(exc), 422)
        await app.state.selector.enrich(result, request, selected)
        return result

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"], include_in_schema=False)
    async def unknown_api(path: str):
        # Keep unknown API paths out of the frontend mount, even after a UI build.
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    # Same-origin production UI; all API routes are registered before the mount.
    static_dir = ROOT / "frontend" / "dist"
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
    return app


app = create_app()
