from dataclasses import replace

import pytest

from app.matching import local_snippet, match, snippets
from app.models import MatchRequest


@pytest.mark.parametrize("cid,feature", [
    ("HK-36965", "казахскую песню"),
    ("HK-58236", "традиционной юртой"),
    ("HK-61323", "фотожурнализм"),
    ("HK-76268", "живые кадры"),
    ("HK-83709", "4 вокалиста"),
    ("HK-23752", "Расширенный состав"),
])
def test_distinctive_catalog_evidence_survives(catalog, cid, feature):
    contractor = next(c for c in catalog.contractors if c.id == cid)
    request = MatchRequest(city=contractor.city, category=contractor.categories[0], date="2026-10-10",
                           event_format=contractor.event_formats[0], budget_kzt=contractor.price_from_kzt)
    quote = local_snippet(contractor, request)
    assert quote is not None and feature in quote
    assert quote in contractor.description


def test_language_claims_still_excluded_but_cuisine_is_kept(catalog):
    contractor = replace(catalog.contractors[0], description=(
        "Веду на русском и казахском. Работаю на английском. Владею тремя языками. "
        "Стоимость от 100000 тенге. Цена 100000. Работаю 6 ч. "
        "В репертуаре казахские песни. Национальная казахская кухня и панорамная терраса."
    ))
    assert snippets(contractor) == ["В репертуаре казахские песни.", "Национальная казахская кухня и панорамная терраса."]


def test_all_original_profiles_have_source_evidence(catalog):
    for contractor in catalog.contractors:
        quotes = snippets(contractor)
        assert quotes, contractor.id
        assert all(q in contractor.description for q in quotes)


def test_photographer_details_are_not_just_category_or_greeting(catalog):
    request = MatchRequest(city="Алматы", category="Фотограф", date="2026-10-10",
                           event_format="свадьба", budget_kzt=10000000)
    result, _ = match(request, catalog)
    descriptions = [next(e.value for e in card.evidence if e.field == "description") for card in result.cards]
    assert len(descriptions) == 3
    assert len(set(descriptions)) == 3
    for quote in descriptions:
        assert quote not in ("Я свадебный фотограф.", "Являюсь свадебным фотографом.")


def test_catalog_evidence_refinement_does_not_change_demo_ranking(catalog, payload):
    result, _ = match(MatchRequest(**payload), catalog)
    assert [card.id for card in result.cards] == ["HK-88430", "HK-29829", "HK-27222"]
