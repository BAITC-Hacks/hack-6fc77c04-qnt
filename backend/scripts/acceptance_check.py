"""Offline structural acceptance across all 100 dates; no OpenAI or credentials.

Text uniqueness is a mechanical check, not a substitute for human relevance QA.
"""
from collections import Counter
from datetime import timedelta
from itertools import product
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.catalog import load_catalog
from app.matching import match
from app.models import DATE_MIN, DATE_MAX, MatchRequest


def run():
    started = time.perf_counter()
    catalog = load_catalog()
    by_id = {c.id: c for c in catalog.contractors}
    days = [DATE_MIN + timedelta(days=n) for n in range((DATE_MAX-DATE_MIN).days+1)]
    outcomes = Counter()
    requests = cards = 0
    for city, category, fmt, day in product(catalog.options["cities"], catalog.options["categories"], catalog.options["event_formats"], days):
        request = MatchRequest(city=city, category=category, event_format=fmt, date=day, budget_kzt=10000000)
        result, selected = match(request, catalog)
        repeated, _ = match(request, catalog)
        assert [c.id for c in result.cards] == [c.id for c in repeated.cards]
        assert sum(r.count for r in result.rejections) + result.eligible_count == result.total_in_category
        assert result.returned_count == len(result.cards) == min(result.eligible_count, 3)
        independent = [c for c in catalog.contractors if c.city == city and category in c.categories
                       and day not in c.busy_dates and fmt in c.event_formats and c.price_from_kzt <= request.budget_kzt]
        assert result.eligible_count == len(independent)
        assert all(c in independent for c in selected)
        anonymous = []
        for card in result.cards:
            original = by_id[card.id]
            assert card.explanation_mode == "local"
            assert card.price_from_kzt == original.price_from_kzt
            quotes = [e.value for e in card.evidence if e.field == "description"]
            assert quotes and all(quote in original.description for quote in quotes)
            anonymous.append(card.explanation.replace(card.name, "<name>"))
        assert len(set(anonymous)) == len(anonymous), (city, category, fmt, day)
        outcomes[result.status] += 1
        requests += 1
        cards += len(result.cards)
    print(json.dumps({"requests": requests, "calendar_days": len(days), "cards_checked": cards,
                      "outcomes": outcomes, "seconds": round(time.perf_counter()-started, 3),
                      "source_sha256": catalog.digest, "paid_requests": 0,
                      "scope": "all cities/categories/formats/dates; budget 10M, no optional filters; exact-name-removal uniqueness only"}, ensure_ascii=False))


if __name__ == "__main__":
    run()
