from dataclasses import replace
from datetime import date

import pytest

from app.catalog import Catalog, load_catalog, parse_bool, split_list
from app.matching import format_mentioned, local_snippet, match, rejection
from app.models import MatchRequest


def test_catalog_integrity(catalog):
    assert len(catalog.contractors) == 66
    assert len({c.id for c in catalog.contractors}) == 66
    assert catalog.digest == "6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d"
    assert len(catalog.options["categories"]) == 17
    assert sum(c.synthetic for c in catalog.contractors) == 13
    assert sum(c.price_imputed for c in catalog.contractors) == 18
    assert sum(c.city_imputed for c in catalog.contractors) == 8
    assert sum(c.max_hours is None for c in catalog.contractors) == 9


def test_dense_and_date_change(catalog, payload):
    first, selected = match(MatchRequest(**payload), catalog)
    second, _ = match(MatchRequest(**{**payload, "date": "2026-10-11"}), catalog)
    assert first.eligible_count == second.eligible_count == 4
    assert first.returned_count == second.returned_count == 3
    assert [c.id for c in first.cards] != [c.id for c in second.cards]
    assert all(date(2026, 10, 10) not in c.busy_dates for c in selected)
    assert "10.10.2026" in first.message and "11.10.2026" in second.message
    repeated, _ = match(MatchRequest(**payload), catalog)
    assert first == repeated


def test_rare_null_hours(catalog, payload):
    request = MatchRequest(**{**payload, "category": "Флорист", "event_format": "свадьба",
                             "budget_kzt": 300000, "language": None, "duration_hours": 24})
    result, _ = match(request, catalog)
    assert result.status == "matches_found"
    assert [c.id for c in result.cards] == ["HK-39372"]
    assert result.cards[0].max_hours is None
    assert next(e.value for e in result.cards[0].evidence if e.field == "max_hours") == "неприменимо"
    assert "отсев" in result.message


def test_empty_outcomes_are_distinct(catalog, payload):
    empty, _ = match(MatchRequest(**{**payload, "budget_kzt": 1000}), catalog)
    missing, _ = match(MatchRequest(**{**payload, "city": "Зарубежье", "category": "Флорист"}), catalog)
    assert empty.status == "no_matches" and empty.total_in_category > 0
    assert missing.status == "category_missing" and missing.total_in_category == 0
    assert not empty.cards and not missing.cards
    assert "бюджет" in empty.message and "категория" in missing.message.lower()


@pytest.mark.parametrize("changes,reason", [
    ({"busy_dates": frozenset([date(2026, 10, 10)])}, "busy"),
    ({"event_formats": ("свадьба",)}, "format"),
    ({"price_from_kzt": 1000001}, "budget"),
    ({"languages": ("английский",)}, "language"),
    ({"max_hours": 3.99}, "duration"),
    ({"max_hours": 4, "price_from_kzt": 1000000}, None),
    ({"max_hours": None}, None),
])
def test_each_constraint(catalog, payload, changes, reason):
    c = next(c for c in catalog.contractors if c.id == "HK-88430")
    assert rejection(replace(c, **changes), MatchRequest(**payload)) == reason


def test_optional_filters(catalog, payload):
    c = next(c for c in catalog.contractors if c.id == "HK-88430")
    c = replace(c, languages=("английский",), max_hours=1)
    assert rejection(c, MatchRequest(**{**payload, "language": None, "duration_hours": None})) is None


def test_explanation_prefers_specific_detail_over_greeting(catalog, payload):
    c = next(c for c in catalog.contractors if c.id == "HK-44923")
    quote = local_snippet(c, MatchRequest(**payload))
    assert quote in c.description
    assert "Приветствую" not in quote


def test_busy_venue_uses_same_rules(catalog, payload):
    venue = next(c for c in catalog.contractors if "Банкетный зал" in c.categories)
    venue = replace(venue, busy_dates=frozenset([date(2026, 10, 10)]))
    assert rejection(venue, MatchRequest(**payload)) == "busy"


def test_ranking_and_stable_id_tie(catalog, payload):
    base = next(c for c in catalog.contractors if c.id == "HK-88430")
    records = (
        replace(base, id="HK-4", price_from_kzt=100000, description="Особенная программа для гостей."),
        replace(base, id="HK-3", price_from_kzt=300000, description="Корпоративные мероприятия и деловые встречи."),
        replace(base, id="HK-2", price_from_kzt=300000, description="Корпоративные мероприятия и деловые встречи."),
        replace(base, id="HK-1", price_from_kzt=200000, description="Корпоративные мероприятия и деловые встречи."),
    )
    result, _ = match(MatchRequest(**payload), Catalog(records))
    assert [c.id for c in result.cards] == ["HK-1", "HK-2", "HK-3"]
    assert result.eligible_count == 4 and result.returned_count == 3


@pytest.mark.parametrize("text,fmt,expected", [
    ("Свадебные церемонии", "свадьба", True), ("Юбилеи", "юбилей", True),
    ("Той и свадьбы", "той", True), ("Простой выбор", "той", False),
    ("Организация дня рождения", "день рождения", True),
    ("Корпоративный праздник", "корпоратив", True),
])
def test_format_signal(text, fmt, expected):
    assert format_mentioned(text, fmt) is expected


def test_conservation_across_catalog(catalog):
    for contractor in catalog.contractors:
        for day in ("2026-09-23", "2026-10-10", "2026-12-31"):
            request = MatchRequest(city=contractor.city, category=contractor.categories[0], date=day,
                                   event_format=contractor.event_formats[0], budget_kzt=contractor.price_from_kzt)
            result, selected = match(request, catalog)
            assert sum(r.count for r in result.rejections) + result.eligible_count == result.total_in_category
            assert result.returned_count == len(result.cards) == min(3, result.eligible_count)
            assert all(rejection(c, request) is None for c in selected)
            assert all(c.explanation_mode == "local" for c in result.cards)
            descriptions = {c.id: c.description for c in selected}
            for card in result.cards:
                for evidence in card.evidence:
                    if evidence.field == "description":
                        assert evidence.value in descriptions[card.id]


def test_bad_catalog_rejected(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("id,anon_name\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_catalog(path)
    with pytest.raises(ValueError):
        parse_bool("false")
    with pytest.raises(ValueError):
        split_list("a|a")
