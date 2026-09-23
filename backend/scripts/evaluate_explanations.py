"""Offline rubric evaluation by default; --live explicitly spends up to 6 calls/model.

Uses the production selector and persistent allowance, not a separate free budget.
No credentials or raw provider/error bodies are logged or saved.
"""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import statistics
import sys
import tempfile
import time
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.budget import CallBudget
from app.catalog import load_catalog
from app.explanations import EvidenceSelector
from app.explanation_text import decision_lens
from app.matching import match
from app.models import MatchRequest

FIXTURE = ROOT / 'backend/tests/fixtures/explanation_eval.json'
# Published standard token rates, checked 2026-09-23. Estimates, not billing receipts.
RATES = {'gpt-4.1-mini': (0.40, 0.10, 1.60), 'gpt-4.1': (2.00, 0.50, 8.00)}


class MeasuredClient(httpx.AsyncClient):
    def __init__(self):
        super().__init__(trust_env=False, follow_redirects=False)
        self.observations = []

    async def post(self, *args, **kwargs):
        response = await super().post(*args, **kwargs)
        row = {'status': response.status_code}
        if response.is_success:
            body = response.json()
            usage = body.get('usage', {})
            row.update(snapshot=body.get('model'), input_tokens=usage.get('input_tokens', 0),
                       output_tokens=usage.get('output_tokens', 0),
                       cached_tokens=usage.get('input_tokens_details', {}).get('cached_tokens', 0))
        self.observations.append(row)
        return response


def score_card(card, contractor, selected, case, request):
    quote = next((e.value for e in card.evidence if e.field == 'description'), '')
    points = max((r['points'] for r in case['grades'][card.id] if r['contains'].casefold() in quote.casefold()), default=0)
    return {'id': card.id, 'mode': card.explanation_mode, 'quote': quote, 'explanation': card.explanation,
            'source_exact': bool(quote) and quote in contractor.description,
            'unique_source_in_result': bool(quote) and sum(quote in c.description for c in selected) == 1,
            'rubric_points': points, 'conditional_guidance': decision_lens(request, quote) is not None,
            'characters': len(card.explanation)}


async def run(args):
    fixture_bytes = FIXTURE.read_bytes()
    cases = json.loads(fixture_bytes)['cases']
    catalog = load_catalog()
    if args.live:
        load_dotenv(ROOT / '.env', override=False)
        if not os.getenv('OPENAI_API_KEY') or os.getenv('ENABLE_AI', '').lower() != 'true':
            raise SystemExit('Live evaluation needs locally configured AI; no credentials are printed.')
    report = {'created_at_utc': datetime.now(timezone.utc).isoformat(), 'live': args.live,
              'source_sha256': catalog.digest, 'rubric_sha256': hashlib.sha256(fixture_bytes).hexdigest(),
              'implementation_sha256': {name: hashlib.sha256((ROOT / 'backend/app' / name).read_bytes()).hexdigest() for name in ['matching.py', 'explanations.py', 'explanation_text.py']},
              'limitations': '6 handpicked requests, 13 cards; internal lexical rubric, no blind human panel; one attempt/case/model; no p95 or organizer-score claim.', 'models': []}
    async with MeasuredClient() as client:
        for model in args.models if args.live else ['local']:
            selector = EvidenceSelector(client, enabled=args.live, api_key=os.getenv('OPENAI_API_KEY', '') if args.live else '',
                                        model=model, budget=CallBudget.from_env(ROOT))
            rows = []
            for case in cases:
                request = MatchRequest(**case['request'])
                result, selected = match(request, catalog)
                before_ids = [c.id for c in result.cards]
                assert set(before_ids) == set(case['grades']), 'Fixture/candidate drift; update rubric explicitly'
                observation_start = len(client.observations)
                started = time.perf_counter()
                await selector.enrich(result, request, selected)
                elapsed = time.perf_counter() - started
                assert before_ids == [c.id for c in result.cards]
                row = {'case': case['name'], 'request': case['request'], 'seconds': round(elapsed, 4),
                       'order_unchanged': True, 'provider': client.observations[observation_start:],
                       'cards': [score_card(card, next(c for c in selected if c.id == card.id), selected, case, request) for card in result.cards]}
                repeat, same = match(request, catalog)
                await selector.enrich(repeat, request, same)
                row['repeat_identical'] = repeat == result
                row['repeat_no_network'] = len(client.observations) == observation_start + len(row['provider'])
                rows.append(row)
                print(json.dumps({'model': model, 'case': case['name'], 'seconds': row['seconds'], 'points': sum(c['rubric_points'] for c in row['cards']), 'all_ai': all(c['mode'] == 'ai' for c in row['cards'])}, ensure_ascii=False), flush=True)
            cards = [c for r in rows for c in r['cards']]
            observations = [o for r in rows for o in r['provider']]
            cost = None
            if model in RATES:
                price_in, price_cache, price_out = RATES[model]
                cost = sum(((o.get('input_tokens', 0)-o.get('cached_tokens', 0))*price_in + o.get('cached_tokens', 0)*price_cache + o.get('output_tokens', 0)*price_out)/1e6 for o in observations)
            report['models'].append({'model': model, 'cases': rows,
                'summary': {'cards': len(cards), 'ai_cards': sum(c['mode']=='ai' for c in cards),
                'source_exact': sum(c['source_exact'] for c in cards), 'unique_source': sum(c['unique_source_in_result'] for c in cards),
                'rubric_points': sum(c['rubric_points'] for c in cards), 'rubric_max': 2*len(cards),
                'conditional_guidance': sum(c['conditional_guidance'] for c in cards),
                'mean_characters': round(statistics.mean(c['characters'] for c in cards), 1),
                'median_seconds': round(statistics.median(r['seconds'] for r in rows), 4),
                'max_seconds': max(r['seconds'] for r in rows), 'estimated_usd': round(cost, 6) if cost is not None else None}})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'report': str(args.output), 'summary': [{m['model']: m['summary']} for m in report['models']]}, ensure_ascii=False))
    if any(not r['repeat_identical'] or not r['repeat_no_network'] or any(not c['source_exact'] or not c['unique_source_in_result'] or c['rubric_points'] < 1 for c in r['cards']) for m in report['models'] for r in m['cases']):
        raise SystemExit('Evidence or minimum relevance checks failed; inspect the saved report.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--models', nargs='+', choices=list(RATES), default=['gpt-4.1-mini', 'gpt-4.1'])
    parser.add_argument('--output', type=Path, default=Path(tempfile.gettempdir())/'qnt-explanation-eval.json')
    asyncio.run(run(parser.parse_args()))
