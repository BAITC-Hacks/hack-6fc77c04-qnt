"""Bounded decision guidance: claims come from evidence, preferences stay conditional.

No LLM-generated prose is accepted as a catalog fact. Rules don't filter/rank
contractors. A source quote, not the presence of a keyword alone, remains visible.
"""
import re

from .models import MatchRequest

# Conservative phrases describing what to look for, never an outcome guarantee.
# Restrict by category where a word could describe a different kind of service.
LENSES = (
    (("Ведущий", "Ведущий церемонии"), r"специализ\w*.*корпоратив.*делов", "специализация на корпоративных и деловых мероприятиях"),
    (("Ведущий", "Ведущий церемонии"), r"развлеч\w*.*танц|танц\w*.*развлеч", "акцент на развлечениях и танцах"),
    (("Ведущий", "Ведущий церемонии"), r"юмор", "подача с юмором"),
    (("Ведущий", "Ведущий церемонии"), r"импровиз", "импровизация ведущего"),
    (("Фотограф", "Видеограф"), r"репортаж|фотожурнал|документал", "репортажный подход к съёмке"),
    (("Фотограф", "Видеограф"), r"живые кадры|живые эмоции|настоящие улыбки|не про позы", "естественные кадры и живые эмоции"),
    (("Флорист", "Декоратор"), r"авторск\w*\s+цветоч|цветоч\w*\s+оформлен", "цветочное оформление события"),
    (("Флорист", "Декоратор"), r"фотозон|арки|президиум|сценограф", "оформление пространства мероприятия"),
    (("Лайв-бэнд", "Национальный ансамбль"), r"состав|\d+\s+вокал", "состав музыкального коллектива"),
    (("Лайв-бэнд", "Национальный ансамбль", "Инструменталист"), r"репертуар|ретро-хит|казахск\w*\s+пес", "репертуар исполнителей"),
    (("Инструменталист",), r"саксофон|скрип|гитар|клавиш|домбр", "живое инструментальное исполнение"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"традиционн\w*\s+юрт", "интерьер с национальными мотивами"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"кухн", "кухня площадки"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"панорам|вид\w*\s+на\s+(?:город|гор)", "панорамный вид"),
    (("Подарки и сувениры",), r"брендированн\w*\s+(?:подар|сувен|упаков)|гравиров|персонализац|нанес\w*.*логотип", "персонализация подарков"),
    (("Фото и видеобудки",), r"печат|рамк|брендир", "оформление и печать снимков"),
    (("Танцевальный коллектив",), r"хореограф|танц", "танцевальная часть программы"),
)


def decision_lens(request: MatchRequest, quote: str | None) -> str | None:
    if not quote:
        return None
    text = quote.casefold().replace("ё", "е")
    # Don't turn a negative capability claim into an affirmative buying reason.
    # Explicit "не про позы" is a stylistic description, not a service promise.
    if re.search(r"\b(?:нет|без|не\s+(?!про позы))\b", text):
        return None
    for categories, pattern, preference in LENSES:
        if request.category in categories and re.search(pattern, text):
            return preference
    return None


def explanation_text(request: MatchRequest, quote: str | None) -> str:
    preference = decision_lens(request, quote)
    if preference:
        lead = f"Стоит рассмотреть для формата «{request.event_format}», если в приоритете {preference}."
    else:
        lead = f"Формат «{request.event_format}» и начальная цена подходят запросу; сравните особенность профиля."
    if not quote:
        return f"Формат «{request.event_format}» и начальная цена подходят запросу; в описании недостаточно конкретных фактов для индивидуального обоснования."
    return lead + " В описании: «" + quote.rstrip(".!? ") + "»."
