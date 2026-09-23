from __future__ import annotations

import csv
import hashlib
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .models import DATE_MAX, DATE_MIN, MatchRequest

DEFAULT_DATASET = Path(__file__).resolve().parents[2] / "data" / "contractors.csv"


@dataclass(frozen=True)
class Contractor:
    id: str
    name: str
    categories: tuple[str, ...]
    city: str
    price_from_kzt: int
    event_formats: tuple[str, ...]
    languages: tuple[str, ...]
    max_hours: float | None
    busy_dates: frozenset[date]
    description: str
    synthetic: bool
    city_imputed: bool
    price_imputed: bool


def split_list(value: str, *, optional: bool = False) -> tuple[str, ...]:
    if not value and optional:
        return ()
    result = tuple(item.strip() for item in value.split("|"))
    if not all(result) or len(set(result)) != len(result):
        raise ValueError("Invalid list in catalog")
    return result


def parse_bool(value: str) -> bool:
    if value not in ("True", "False"):
        raise ValueError("Invalid boolean in catalog")
    return value == "True"


class Catalog:
    def __init__(self, contractors: tuple[Contractor, ...], digest: str = "test"):
        self.contractors = contractors
        self.digest = digest
        self.options = {
            "cities": sorted({c.city for c in contractors}),
            "categories": sorted({v for c in contractors for v in c.categories}),
            "event_formats": sorted({v for c in contractors for v in c.event_formats}),
            "languages": sorted({v for c in contractors for v in c.languages}),
            "date_min": DATE_MIN.isoformat(),
            "date_max": DATE_MAX.isoformat(),
            "dataset_count": len(contractors),
        }

    def validate_request(self, request: MatchRequest) -> None:
        for field, key in (("city", "cities"), ("category", "categories"),
                           ("event_format", "event_formats"), ("language", "languages")):
            value = getattr(request, field)
            if value is not None and value not in self.options[key]:
                raise ValueError(f"Неизвестное значение поля {field}; выберите из справочника")


def load_catalog(path: Path = DEFAULT_DATASET, expected_count: int = 66) -> Catalog:
    raw = path.read_bytes()
    records: list[Contractor] = []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            if not re.fullmatch(r"HK-\d+", row["id"]):
                raise ValueError("Invalid ID")
            if not all(row[field].strip() for field in ("anon_name", "city", "description")):
                raise ValueError("Empty required field")
            price = int(row["price_from_kzt"])
            hours = float(row["max_hours"]) if row["max_hours"] else None
            if price <= 0 or (hours is not None and (not math.isfinite(hours) or hours <= 0)):
                raise ValueError("Invalid price or duration")
            busy = frozenset(date.fromisoformat(v) for v in split_list(row["busy_dates"], optional=True))
            if any(not DATE_MIN <= day <= DATE_MAX for day in busy):
                raise ValueError("Busy date outside calendar")
            records.append(Contractor(
                id=row["id"], name=row["anon_name"], city=row["city"],
                categories=split_list(row["categories"]), price_from_kzt=price,
                event_formats=split_list(row["event_formats"]),
                languages=split_list(row["languages"]), max_hours=hours,
                busy_dates=busy, description=row["description"],
                synthetic=parse_bool(row["synthetic"]),
                city_imputed=parse_bool(row["city_imputed"]),
                price_imputed=parse_bool(row["price_imputed"]),
            ))
    if len(records) != expected_count or len({c.id for c in records}) != len(records):
        raise ValueError("Unexpected count or duplicate IDs")
    return Catalog(tuple(records), hashlib.sha256(raw).hexdigest())
