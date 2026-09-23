"""Reproducible core demo; no credentials, server, or model request needed."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.catalog import load_catalog
from app.matching import match
from app.models import MatchRequest


def main():
    catalog = load_catalog()
    base = dict(city="Алматы", category="Ведущий", event_format="корпоратив", date="2026-10-10",
                budget_kzt=1000000, language="русский", duration_hours=4)
    cases = {
        "dense": base,
        "date_change": {**base, "date": "2026-10-11"},
        "rare": {**base, "category": "Флорист", "event_format": "свадьба", "budget_kzt": 300000,
                 "language": None, "duration_hours": None},
        "no_matches": {**base, "budget_kzt": 1000},
        "category_missing": {**base, "city": "Зарубежье", "category": "Флорист"},
    }
    for name, values in cases.items():
        result, _ = match(MatchRequest(**values), catalog)
        print(json.dumps({"case": name, "status": result.status, "eligible_count": result.eligible_count,
                          "ids": [c.id for c in result.cards], "message": result.message,
                          "explanations": [c.explanation for c in result.cards]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
