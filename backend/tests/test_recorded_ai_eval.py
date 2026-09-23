"""Replay published, real model selections without a key or paid calls."""
import hashlib
import json
from pathlib import Path

from app.matching import explanation, match, relevant_snippets
from app.models import MatchRequest

ROOT = Path(__file__).resolve().parents[2]

# The real trials keep their original formatter and timings. These are explicit
# expectations for replaying the SAME chosen evidence through the concise UI
# formatter, not a new AI experiment or a replacement for the published report.
CONCISE_LEADS = {
    ('HK-88430', 'Ведущий'): 'Специализация — корпоративные и деловые мероприятия.',
    ('HK-29829', 'Ведущий'): 'Акцент — развлечения и танцы.',
    ('HK-27222', 'Ведущий'): 'Подача с юмором.',
    ('HK-30583', 'Фотограф'): 'Акцент в описании — эстетика, атмосфера и детали.',
    ('HK-16628', 'Фотограф'): 'Репортажный подход к съёмке.',
    ('HK-53108', 'Фотограф'): 'Опыт съёмки — около семи лет.',
    ('HK-39372', 'Флорист'): 'Авторское цветочное оформление.',
    ('HK-23752', 'Лайв-бэнд'): 'Репертуар: ретро-хиты, музыка нулевых и казахская музыка.',
    ('HK-50695', 'Ресторан'): 'Террасы, живая музыка и виды на горы.',
    ('HK-64395', 'Ресторан'): 'В описании — террасы и закаты.',
    ('HK-58236', 'Ресторан'): 'Интерьер в стиле традиционной юрты.',
    ('HK-64395', 'Банкетный зал'): 'Панорамный вид.',
    ('HK-90011', 'Банкетный зал'): 'Вместимость — до 200 гостей.',
}


def test_published_ai_trials_are_replayable_source_evidence(catalog):
    report = json.loads((ROOT/'docs/ai-eval-results.json').read_text())
    fixture = (ROOT/'backend/tests/fixtures/explanation_eval.json').read_bytes()
    assert report['source_sha256'] == catalog.digest
    assert report['rubric_sha256'] == hashlib.sha256(fixture).hexdigest()
    for model in report['models']:
        assert len(model['cases']) == 6
        for case in model['cases']:
            request = MatchRequest(**case['request'])
            _, selected = match(request, catalog)
            assert [c.id for c in selected] == [c['id'] for c in case['cards']]
            assert case['repeat_identical'] and case['repeat_no_network']
            for recorded, original in zip(case['cards'], selected):
                assert recorded['mode'] == 'ai'
                assert recorded['quote'] in relevant_snippets(original, request)
                source_suffix = ' В описании: «' + recorded['quote'].rstrip('.!? ') + '».'
                assert recorded['explanation'].endswith(source_suffix)
                if original.id == 'HK-90011':
                    # The historical formatter predated the windows/view fix;
                    # preserve that mistake in the report instead of rewriting history.
                    assert 'Панорамные окна' in recorded['quote']
                    assert 'если в приоритете панорамный вид.' in recorded['explanation']
                lead = CONCISE_LEADS[(original.id, request.category)]
                if original.id == 'HK-64395' and recorded['quote'].startswith('Nerima Terrace'):
                    # The two real models selected different restaurant details.
                    lead = 'Панорамный вид.'
                assert explanation(original, request, recorded['quote']) == lead + source_suffix
                assert len(lead) < len(recorded['explanation'].split(' В описании: ')[0])
                assert recorded['source_exact'] and recorded['unique_source_in_result']
