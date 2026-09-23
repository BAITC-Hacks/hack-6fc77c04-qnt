from dataclasses import replace
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.catalog import Catalog
from app.main import create_app
from app.matching import match
from app.models import DATE_MAX, DATE_MIN, MatchRequest
from app.recovery import recovery_suggestions


@pytest.fixture
def contractor(catalog):
    return replace(next(c for c in catalog.contractors if c.id == "HK-88430"),
                   price_from_kzt=100000, busy_dates=frozenset(), max_hours=6,
                   languages=("русский",), event_formats=("корпоратив",))


def assert_verified(request, catalog, response):
    assert len(response.suggestions) <= 2
    for suggestion in response.suggestions:
        differences = [field for field in type(request).model_fields
                       if getattr(request, field) != getattr(suggestion.request, field)]
        assert differences == suggestion.changed_fields
        result, _ = match(suggestion.request, catalog)
        assert result.status == "matches_found"
        assert result.eligible_count == suggestion.eligible_count > 0
        assert result.returned_count > 0


def test_nearest_date_is_verified_and_future_wins_a_tie(contractor, payload):
    request = MatchRequest(**payload)
    busy = frozenset(request.date + timedelta(days=offset) for offset in (-1, 0, 1))
    catalog = Catalog((replace(contractor, busy_dates=busy),))
    original = request.model_dump()
    response = recovery_suggestions(request, catalog)
    assert len(response.suggestions) == 1
    assert response.suggestions[0].changed_fields == ["date"]
    assert response.suggestions[0].request.date == request.date + timedelta(days=2)
    assert request.model_dump() == original
    assert response == recovery_suggestions(request, catalog)
    assert_verified(request, catalog, response)


@pytest.mark.parametrize("day,alternative", [(DATE_MIN, DATE_MIN + timedelta(days=1)),
                                            (DATE_MAX, DATE_MAX - timedelta(days=1))])
def test_date_stays_inside_the_calendar(contractor, payload, day, alternative):
    request = MatchRequest(**{**payload, "date": day})
    catalog = Catalog((replace(contractor, busy_dates=frozenset([day])),))
    response = recovery_suggestions(request, catalog)
    assert response.suggestions[0].request.date == alternative
    assert_verified(request, catalog, response)


def test_budget_is_minimum_that_passes_every_other_condition(contractor, payload):
    request = MatchRequest(**{**payload, "budget_kzt": 1000})
    catalog = Catalog((
        replace(contractor, id="HK-1", price_from_kzt=200000, languages=("английский",)),
        replace(contractor, id="HK-2", price_from_kzt=250000, event_formats=("свадьба",)),
        replace(contractor, id="HK-3", price_from_kzt=300000, max_hours=3),
        replace(contractor, id="HK-4", price_from_kzt=400000, busy_dates=frozenset([request.date])),
        replace(contractor, id="HK-5", price_from_kzt=500000),
        replace(contractor, id="HK-6", price_from_kzt=800000),
    ))
    response = recovery_suggestions(request, catalog)
    assert len(response.suggestions) == 1
    assert response.suggestions[0].changed_fields == ["budget_kzt"]
    assert response.suggestions[0].request.budget_kzt == 500000
    assert response.suggestions[0].eligible_count == 1
    assert_verified(request, catalog, response)


def test_two_independent_suggestions_do_not_combine_changes(contractor, payload):
    request = MatchRequest(**{**payload, "budget_kzt": 100000})
    catalog = Catalog((
        replace(contractor, id="HK-1", busy_dates=frozenset([request.date])),
        replace(contractor, id="HK-2", price_from_kzt=300000),
    ))
    response = recovery_suggestions(request, catalog)
    assert [s.changed_fields for s in response.suggestions] == [["date"], ["budget_kzt"]]
    assert response.suggestions[0].request.budget_kzt == request.budget_kzt
    assert response.suggestions[1].request.date == request.date
    assert_verified(request, catalog, response)


def test_does_not_offer_a_dead_end_requiring_two_changes(contractor, payload):
    request = MatchRequest(**{**payload, "budget_kzt": 1000})
    catalog = Catalog((replace(contractor, busy_dates=frozenset([request.date])),))
    assert recovery_suggestions(request, catalog).suggestions == []


def test_does_not_offer_a_date_when_all_calendar_days_are_busy(contractor, payload):
    busy = frozenset(DATE_MIN + timedelta(days=day) for day in range(100))
    catalog = Catalog((replace(contractor, busy_dates=busy),))
    assert recovery_suggestions(MatchRequest(**payload), catalog).suggestions == []


def test_success_and_missing_category_do_not_offer_relaxations(catalog, payload):
    request = MatchRequest(**payload)
    assert recovery_suggestions(request, catalog).suggestions == []
    missing = request.model_copy(update={"city": "Зарубежье", "category": "Флорист"})
    assert match(missing, catalog)[0].status == "category_missing"
    assert recovery_suggestions(missing, catalog).suggestions == []


def test_proposals_across_the_real_catalog_are_executable(catalog):
    for contractor in catalog.contractors:
        for day in (DATE_MIN, DATE_MAX):
            request = MatchRequest(city=contractor.city, category=contractor.categories[0],
                                   event_format=contractor.event_formats[0], date=day,
                                   budget_kzt=1000)
            assert_verified(request, catalog, recovery_suggestions(request, catalog))


def test_endpoint_returns_verified_requests_without_using_ai(catalog, payload):
    class ForbiddenSelector:
        async def enrich(self, *args):
            raise AssertionError("Recovery suggestions must never spend an AI call")

    with TestClient(create_app(catalog=catalog, selector=ForbiddenSelector())) as client:
        response = client.post("/api/suggestions", json={**payload, "budget_kzt": 1000})
        assert response.status_code == 200
        data = response.json()
        assert set(data) == {"suggestions"}
        assert data["suggestions"]
        for suggestion in data["suggestions"]:
            result, _ = match(MatchRequest(**suggestion["request"]), catalog)
            assert result.eligible_count == suggestion["eligible_count"] > 0


@pytest.mark.parametrize("changes", [{"city": "Москва"}, {"date": "2027-01-01"},
                                     {"budget_kzt": 0}, {"budget_kzt": "1000"},
                                     {"extra": "field"}, {"duration_hours": -1}])
def test_suggestions_use_the_existing_validation_envelope(client, payload, changes):
    response = client.post("/api/suggestions", json={**payload, **changes})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
