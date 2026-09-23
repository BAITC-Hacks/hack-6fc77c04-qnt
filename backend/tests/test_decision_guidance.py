import pytest

from app.explanation_text import decision_lens, explanation_text
from app.matching import local_snippet, match, snippets
from app.models import MatchRequest


def test_three_distinct_buying_reasons_without_names(catalog, payload):
    request = MatchRequest(**payload)
    result, _ = match(request, catalog)
    leads = [c.explanation.split(' В описании: ')[0] for c in result.cards]
    assert 'корпоративные и деловые' in leads[0]
    assert 'развлечения и танцы' in leads[1]
    assert 'юмором' in leads[2]
    assert len(set(leads)) == 3
    assert all(len(lead) <= 80 for lead in leads)
    assert all('если в приоритете' not in lead for lead in leads)
    assert all(card.name not in card.explanation for card in result.cards)


@pytest.mark.parametrize('quote', ['У меня нет юмора.', 'Веду без юмора.', 'Я не использую юмор.'])
def test_negative_source_is_not_a_positive_buying_reason(payload, quote):
    assert decision_lens(MatchRequest(**payload), quote) is None


def test_branded_event_does_not_imply_personalized_gifts(payload):
    request = MatchRequest(**{**payload, 'category': 'Подарки и сувениры'})
    assert decision_lens(request, 'Наши подарки подходят для брендированных событий и презентаций.') is None
    assert decision_lens(request, 'Выполняем гравировку на подарках.') == 'персонализация подарков'


def test_panorama_does_not_promise_a_terrace(payload):
    request = MatchRequest(**{**payload, 'category': 'Ресторан'})
    text = explanation_text(request, 'Панорамная локация с видом на город и горы.')
    assert 'террас' not in text and 'открыт' not in text


def test_catalog_windows_do_not_promise_a_view(catalog, payload):
    request = MatchRequest(**{**payload, 'category': 'Банкетный зал', 'event_format': 'свадьба'})
    contractor = next(c for c in catalog.contractors if c.id == 'HK-90011')
    quote = local_snippet(contractor, request)
    assert 'Панорамные окна' in quote
    assert decision_lens(request, quote) == 'вместимость — до 200 гостей'
    text = explanation_text(request, quote)
    assert text.startswith('Вместимость — до 200 гостей.')
    assert 'панорамный вид' not in text
    assert quote.rstrip('.!? ') in text


@pytest.mark.parametrize('quote', [
    'Панорамная локация с видом на город и горы.',
    'Панорамные окна с видом на горы.',
    'Из зала открывается панорамный вид.',
])
def test_explicit_view_remains_a_buying_reason(payload, quote):
    request = MatchRequest(**{**payload, 'category': 'Банкетный зал'})
    assert decision_lens(request, quote) == 'панорамный вид'


@pytest.mark.parametrize('quote', ['Панорамная локация для мероприятий.', 'Панорамное видео на экранах.'])
def test_panorama_adjective_alone_does_not_establish_a_view(payload, quote):
    request = MatchRequest(**{**payload, 'category': 'Банкетный зал'})
    assert decision_lens(request, quote) is None


def test_sparse_source_is_not_upgraded_to_a_guarantee(payload):
    request = MatchRequest(**{**payload, 'category': 'Фотограф', 'event_format': 'свадьба'})
    assert decision_lens(request, 'Эстетика, атмосфера, детали — это все про меня.') == 'акцент в описании — эстетика, атмосфера и детали'
    text = explanation_text(request, None)
    assert 'недостаточно конкретных фактов' in text
    assert 'лучший' not in text


def test_windows_alone_remain_windows(payload):
    request = MatchRequest(**{**payload, 'category': 'Банкетный зал'})
    assert decision_lens(request, 'В зале панорамные окна.') == 'панорамные окна'


def test_floral_decoration_does_not_automatically_become_authorial(payload):
    request = MatchRequest(**{**payload, 'category': 'Флорист'})
    assert 'авторск' not in explanation_text(request, 'Цветочное оформление мероприятий.')


def test_photographers_age_does_not_become_years_of_experience(payload):
    request = MatchRequest(**{**payload, 'category': 'Фотограф'})
    assert decision_lens(request, 'Я фотограф, моему ребёнку около семи лет.') is None
    assert decision_lens(request, 'Я фотограф и уже около семи лет я ловлю моменты, которые обычно проходят незаметно.') == 'опыт съёмки — около семи лет'


def test_next_date_still_has_distinct_source_backed_leads(catalog, payload):
    result, _ = match(MatchRequest(**{**payload, 'date': '2026-10-11'}), catalog)
    leads = [c.explanation.split(' В описании: ')[0] for c in result.cards]
    assert len(set(leads)) == 3
    assert any('DJ' in lead and 'оборудование' in lead for lead in leads)
    assert any('более 10 лет' in lead for lead in leads)
    assert all(len(lead) < 80 for lead in leads)


def test_unrecognized_detail_is_attributed_without_invented_benefit(payload):
    text = explanation_text(MatchRequest(**payload), 'Программу веду в образе Шерлока Холмса.')
    assert text.startswith('В профиле: «Программу веду в образе Шерлока Холмса».')
    assert 'лучший' not in text and 'опыт' not in text


@pytest.mark.parametrize(('quote', 'expected'), [
    ('Террасы, живая музыка и красивые виды на горы.', 'террасы, живая музыка и виды на горы'),
    ('Уютные террасы и эффектные закаты.', 'в описании — террасы и закаты'),
    ('Интерьер вдохновлён традиционной юртой.', 'интерьер в стиле традиционной юрты'),
])
def test_restaurant_distinction_is_a_concrete_source_feature(payload, quote, expected):
    request = MatchRequest(**{**payload, 'category': 'Ресторан'})
    assert decision_lens(request, quote) == expected
    assert 'лучший' not in explanation_text(request, quote)


def test_long_unpunctuated_lists_are_exact_shorter_sources(catalog, payload):
    original = next(c for c in catalog.contractors if c.id == 'HK-31819')
    parts = snippets(original)
    assert all(p in original.description for p in parts)
    assert max(len(p) for p in parts) < 300
    request = MatchRequest(**{**payload, 'category': 'Лайв-бэнд'})
    assert len(local_snippet(original, request)) < 300


def test_unsupported_divorce_outcome_is_not_recommendation_evidence(catalog):
    original = next(c for c in catalog.contractors if c.id == 'HK-42352')
    assert '0 разводов' in original.description
    assert all('0 разводов' not in part for part in snippets(original))
    assert any('13 лет' in part for part in snippets(original))


def test_changed_date_removes_only_actually_busy_profiles(catalog, payload):
    first_request = MatchRequest(**payload)
    second_request = MatchRequest(**{**payload, 'date': '2026-10-11'})
    first, _ = match(first_request, catalog)
    second, _ = match(second_request, catalog)
    first_ids, second_ids = {c.id for c in first.cards}, {c.id for c in second.cards}
    assert first_ids != second_ids
    by_id = {c.id: c for c in catalog.contractors}
    for cid in first_ids - second_ids:
        assert second_request.date in by_id[cid].busy_dates
    for cid in second_ids - first_ids:
        assert first_request.date in by_id[cid].busy_dates
    assert all(any(e.field == 'busy_dates' and '2026-10-11' in e.value for e in c.evidence) for c in second.cards)


def test_all_selected_quotes_fit_only_their_own_card(catalog, payload):
    result, selected = match(MatchRequest(**payload), catalog)
    for card in result.cards:
        quote = next(e.value for e in card.evidence if e.field == 'description')
        assert [c.id for c in selected if quote in c.description] == [card.id]
