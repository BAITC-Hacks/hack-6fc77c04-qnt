import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from app.budget import CallBudget
from app.explanations import EvidenceSelector
from app.matching import match
from app.models import MatchRequest
from test_explanations import provider_response
import json


def test_limit_persists_across_instances(tmp_path):
    path = tmp_path / "state" / "usage.sqlite3"
    assert CallBudget(path, 2).reserve()
    assert CallBudget(path, 2).reserve()
    assert not CallBudget(path, 2).reserve()


def test_concurrent_reservations_cannot_exceed_limit(tmp_path):
    path = tmp_path / "usage.sqlite3"
    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(lambda _: CallBudget(path, 5).reserve(), range(32)))
    assert sum(outcomes) == 5
    assert not CallBudget(path, 5).reserve()


def test_broken_storage_fails_closed(tmp_path):
    assert not CallBudget(tmp_path, 100).reserve()  # A directory cannot be opened as a database.


def test_zero_limit_does_not_create_storage(tmp_path):
    path = tmp_path / "usage.sqlite3"
    assert not CallBudget(path, 0).reserve()
    assert not path.exists()


def test_invalid_limit_disables_paid_requests(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_MAX_CALLS", "unlimited")
    monkeypatch.delenv("AI_USAGE_DB", raising=False)
    assert not CallBudget.from_env(tmp_path).reserve()


def test_budget_blocks_network_but_retains_cached_ai(tmp_path, catalog, payload):
    calls = []
    def handler(request):
        sources = json.loads(json.loads(request.content)["input"])["snippets"]
        calls.append(1)
        return provider_response([{"contractor_id": cid, "snippet_index": 0} for cid in sources])

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            selector = EvidenceSelector(client, api_key="test-only", enabled=True, budget=CallBudget(tmp_path / "usage.sqlite3", 1))
            request = MatchRequest(**payload)
            for _ in range(2):
                result, selected = match(request, catalog)
                await selector.enrich(result, request, selected)
                assert all(c.explanation_mode == "ai" for c in result.cards)
            other = MatchRequest(**{**payload, "date": "2026-10-11"})
            result, selected = match(other, catalog)
            await selector.enrich(result, other, selected)
            assert all(c.explanation_mode == "local" for c in result.cards)
            assert len(calls) == 1
    asyncio.run(run())


def test_failed_upstream_attempt_consumes_allowance(tmp_path, catalog, payload):
    path = tmp_path / "usage.sqlite3"
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(503))) as client:
            selector = EvidenceSelector(client, api_key="test-only", enabled=True, budget=CallBudget(path, 1))
            request = MatchRequest(**payload)
            result, selected = match(request, catalog)
            await selector.enrich(result, request, selected)
            assert all(c.explanation_mode == "local" for c in result.cards)
            assert not CallBudget(path, 1).reserve()
    asyncio.run(run())
