import asyncio
import json

import httpx
import pytest

from app.explanations import EvidenceSelector
from app.matching import match
from app.models import MatchRequest


def provider_response(choices):
    return httpx.Response(200, json={"status": "completed", "output": [
        {"type": "message", "content": [{"type": "output_text", "text": json.dumps({"choices": choices})}]}]})


def test_ai_selects_only_existing_evidence_and_caches(catalog, payload):
    calls = []

    def handler(request):
        body = json.loads(request.content)
        assert body["store"] is False
        assert body["text"]["format"]["strict"] is True
        sources = json.loads(body["input"])["snippets"]
        calls.append(body)
        return provider_response([{"contractor_id": cid, "snippet_index": 0} for cid in sources])

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            selector = EvidenceSelector(client, api_key="test-only-not-a-real-key", enabled=True)
            request = MatchRequest(**payload)
            first, selected = match(request, catalog)
            expected_ids = [c.id for c in first.cards]
            await selector.enrich(first, request, selected)
            second, selected = match(request, catalog)
            await selector.enrich(second, request, selected)
            assert first == second
            assert [c.id for c in first.cards] == expected_ids
            assert all(c.explanation_mode == "ai" for c in first.cards)
            for card in first.cards:
                description = next(c.description for c in selected if c.id == card.id)
                assert next(e.value for e in card.evidence if e.field == "description") in description
        assert len(calls) == 1
    asyncio.run(run())


@pytest.mark.parametrize("failure", ["http", "invalid_json", "wrong_shape", "missing", "unknown", "negative", "duplicate", "bool", "refusal", "timeout"])
def test_ai_failure_is_honest_local_fallback(catalog, payload, failure):
    async def handler(request):
        if failure == "http":
            return httpx.Response(429, json={"error": "do not expose upstream details"})
        if failure == "invalid_json":
            return httpx.Response(200, text="not json")
        if failure == "wrong_shape":
            return httpx.Response(200, json=[])
        if failure == "refusal":
            return httpx.Response(200, json={"status": "completed", "output": []})
        if failure == "timeout":
            await asyncio.sleep(0.1)
        sources = json.loads(json.loads(request.content)["input"])["snippets"]
        choices = [{"contractor_id": cid, "snippet_index": 0} for cid in sources]
        if failure == "missing":
            choices = choices[:-1]
        elif failure == "unknown":
            choices[0]["contractor_id"] = "not-in-catalog"
        elif failure == "negative":
            choices[0]["snippet_index"] = -1
        elif failure == "duplicate":
            choices.append(choices[0])
        elif failure == "bool":
            choices[0]["snippet_index"] = True
        return provider_response(choices)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            selector = EvidenceSelector(client, api_key="test-only", enabled=True, timeout=0.01)
            request = MatchRequest(**payload)
            result, selected = match(request, catalog)
            before = result.model_dump()
            await selector.enrich(result, request, selected)
            assert result.model_dump() == before
            assert all(c.explanation_mode == "local" for c in result.cards)
    asyncio.run(run())


def test_missing_key_never_calls_provider(catalog, payload):
    def handler(request):
        pytest.fail("Network call without credentials")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            selector = EvidenceSelector(client, enabled=True)
            request = MatchRequest(**payload)
            result, selected = match(request, catalog)
            await selector.enrich(result, request, selected)
            assert all(c.explanation_mode == "local" for c in result.cards)
    asyncio.run(run())
