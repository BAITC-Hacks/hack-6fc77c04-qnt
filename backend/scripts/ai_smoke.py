"""Explicit, paid AI smoke test. Never prints credentials or provider error bodies."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import sys
import time

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.catalog import load_catalog
from app.budget import CallBudget
from app.explanations import EvidenceSelector
from app.matching import match
from app.models import MatchRequest


class ObservedClient(httpx.AsyncClient):
    async def post(self, *args, **kwargs):
        response = await super().post(*args, **kwargs)
        report = {"provider_status": response.status_code}
        try:
            body = response.json()
            if response.is_success:
                report.update(model=body.get("model"), usage=body.get("usage"))
            else:
                code = body.get("error", {}).get("code")
                if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,80}", code):
                    report["error_code"] = code
        except (ValueError, AttributeError):
            pass
        print(json.dumps(report, ensure_ascii=False))
        return response


async def run():
    load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
    enabled = os.getenv("ENABLE_AI", "false").lower() == "true"
    key = os.getenv("OPENAI_API_KEY", "")
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    print(json.dumps({"enabled": enabled, "key_configured": bool(key), "model": model}))
    if not enabled or not key:
        raise SystemExit("Enable AI and configure the key locally before the paid smoke test.")
    catalog = load_catalog()
    async with ObservedClient(follow_redirects=False, trust_env=False) as client:
        selector = EvidenceSelector(client, api_key=key, enabled=True, model=model,
                                    budget=CallBudget.from_env(Path(__file__).resolve().parents[2]))
        for name, overrides in [("dense", {}), ("rare", {"category": "Флорист", "event_format": "свадьба", "budget_kzt": 300000, "language": None, "duration_hours": None})]:
            fields = dict(city="Алматы", category="Ведущий", event_format="корпоратив", date="2026-10-10", budget_kzt=1000000, language="русский", duration_hours=4)
            fields.update(overrides)
            request = MatchRequest(**fields)
            result, selected = match(request, catalog)
            started = time.perf_counter()
            await selector.enrich(result, request, selected)
            print(json.dumps({"scenario": name, "seconds": round(time.perf_counter()-started, 3), "cards": [{"id": c.id, "mode": c.explanation_mode, "explanation": c.explanation} for c in result.cards]}, ensure_ascii=False))
            if not result.cards or any(c.explanation_mode != "ai" for c in result.cards):
                raise SystemExit("Live AI not confirmed; deterministic fallback remains available.")
            cached, selected = match(request, catalog)
            started = time.perf_counter()
            await selector.enrich(cached, request, selected)
            assert cached == result
            print(json.dumps({"scenario": name + "_cached", "seconds": round(time.perf_counter()-started, 4)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True, help="Allow up to two paid OpenAI requests")
    parser.parse_args()
    asyncio.run(run())
