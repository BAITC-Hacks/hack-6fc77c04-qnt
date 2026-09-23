"""Short, source-grounded distinctions without inferred customer preferences.

No LLM-generated prose is accepted as a catalog fact. Rules don't filter/rank
contractors. A source quote, not the presence of a keyword alone, remains visible.
"""
import re

from .models import MatchRequest

# One concrete feature of the quoted profile, never an outcome guarantee.
# Restrict by category where a word could describe a different kind of service.
LENSES = (
    (("Ведущий", "Ведущий церемонии"), r"специализ\w*.*корпоратив.*делов", "специализация — корпоративные и деловые мероприятия"),
    (("Ведущий", "Ведущий церемонии"), r"развлеч\w*.*танц|танц\w*.*развлеч", "акцент — развлечения и танцы"),
    (("Ведущий", "Ведущий церемонии"), r"юмор", "подача с юмором"),
    (("Ведущий", "Ведущий церемонии"), r"импровиз", "импровизация ведущего"),
    (("Ведущий", "Ведущий церемонии"), r"\bdj\b.*танцевальн\w*\s+музык.*мультимедийн\w*\s+оборудован", "DJ, танцевальная музыка и мультимедийное оборудование"),
    (("Фотограф", "Видеограф"), r"репортаж|фотожурнал|документал", "репортажный подход к съёмке"),
    (("Фотограф", "Видеограф"), r"живые кадры|живые эмоции|настоящие улыбки|не про позы", "естественные кадры и живые эмоции"),
    (("Фотограф", "Видеограф"), r"эстетик\w*.*атмосфер\w*.*детал", "акцент в описании — эстетика, атмосфера и детали"),
    (("Флорист", "Декоратор"), r"авторск\w*\s+цветоч", "авторское цветочное оформление"),
    (("Флорист", "Декоратор"), r"цветоч\w*\s+оформлен", "цветочное оформление события"),
    (("Флорист", "Декоратор"), r"фотозон|арки|президиум|сценограф", "оформление пространства мероприятия"),
    (("Лайв-бэнд", "Национальный ансамбль"), r"ретро-хит.*нулевых.*казахск", "репертуар: ретро-хиты, музыка нулевых и казахская музыка"),
    (("Лайв-бэнд", "Национальный ансамбль"), r"состав|\d+\s+вокал", "состав музыкального коллектива"),
    (("Лайв-бэнд", "Национальный ансамбль", "Инструменталист"), r"репертуар|ретро-хит|казахск\w*\s+пес", "репертуар исполнителей"),
    (("Инструменталист",), r"саксофон|скрип|гитар|клавиш|домбр", "живое инструментальное исполнение"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"традиционн\w*\s+юрт", "интерьер в стиле традиционной юрты"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"террас.*жив\w*\s+музык.*вид\w*\s+на\s+гор", "террасы, живая музыка и виды на горы"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"террас.*закат", "в описании — террасы и закаты"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"кухн", "кухня площадки"),
    # Panoramic windows alone do not establish what can be seen through them.
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"\bпанорамн\w*\s+вид(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b|\bвид(?:а|у|ом|е|ы|ов|ам|ами|ах)?\s+на\s+(?:город|гор)\w*\b", "панорамный вид"),
    (("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"), r"\bпанорамн\w*\s+ок(?:на|но|ну|не|ном|он|нам|нами|нах)\b", "панорамные окна"),
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
    if request.category in ("Банкетный зал", "Ресторан", "Загородная площадка", "Отель"):
        capacity = re.search(r"вместимость(?:\s+зала)?\s+до\s+(\d{1,5})\s+гост", text)
        if capacity:
            return f"вместимость — до {capacity.group(1)} гостей"
    if request.category in ("Фотограф", "Видеограф"):
        experience = re.search(
            r"(около\s+(?:\d{1,2}|[а-я]+)\s+лет)\s+(?:я\s+)?(?:снимаю|ловлю моменты|работаю фотографом)", text)
        if experience:
            return f"опыт съёмки — {experience.group(1)}"
    if request.category in ("Ведущий", "Ведущий церемонии"):
        experience = re.search(r"опыт\w*\s+работы\s+(более\s+\d{1,2}\s+лет)", text)
        if experience:
            return f"опыт ведущего — {experience.group(1)}"
    for categories, pattern, preference in LENSES:
        if request.category in categories and re.search(pattern, text):
            return preference
    return None


def explanation_text(request: MatchRequest, quote: str | None) -> str:
    preference = decision_lens(request, quote)
    if preference:
        lead = preference[0].upper() + preference[1:] + "."
    else:
        # An unfamiliar feature stays an attributed source excerpt. Do not turn
        # an unrecognized description into an interchangeable invented benefit.
        excerpt = re.split(r"[;\n]", quote or "", maxsplit=1)[0].strip().rstrip(".!? ")
        if len(excerpt) > 110:
            excerpt = excerpt[:107].rsplit(" ", 1)[0] + "…"
        lead = f"В профиле: «{excerpt}»."
    if not quote:
        return f"Формат «{request.event_format}» и начальная цена подходят запросу; в описании недостаточно конкретных фактов для индивидуального обоснования."
    return lead + " В описании: «" + quote.rstrip(".!? ") + "»."
