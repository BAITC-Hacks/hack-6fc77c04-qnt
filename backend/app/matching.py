from __future__ import annotations

import re
from collections import Counter

from .catalog import Catalog, Contractor
from .models import Card, Evidence, Flags, MatchRequest, MatchResponse, Rejection

REASONS = ("busy", "format", "budget", "language", "duration")
REASON_LABELS = {
    "busy": "заняты на выбранную дату", "format": "не берут этот формат",
    "budget": "начальная цена выше бюджета", "language": "не указан нужный язык",
    "duration": "лимит часов меньше запрошенного",
}
FORMAT_PATTERNS = {
    "свадьба": r"\bсвад", "корпоратив": r"\bкорпоратив",
    "конференция": r"\bконференц", "юбилей": r"\bюбиле",
    "день рождения": r"\b(?:день|дня) рождения\b", "той": r"\bтой\b",
}


def format_mentioned(text: str, event_format: str) -> bool:
    pattern = FORMAT_PATTERNS.get(event_format)
    return bool(pattern and re.search(pattern, text.casefold().replace("ё", "е")))


def rejection(c: Contractor, r: MatchRequest) -> str | None:
    if r.date in c.busy_dates:
        return "busy"
    if r.event_format not in c.event_formats:
        return "format"
    if c.price_from_kzt > r.budget_kzt:
        return "budget"
    if r.language and r.language not in c.languages:
        return "language"
    if r.duration_hours is not None and c.max_hours is not None and c.max_hours < r.duration_hours:
        return "duration"
    return None


def snippets(c: Contractor) -> list[str]:
    # Exclude potentially conflicting operational claims from free-text evidence.
    # Structured columns are authoritative for price, language and duration.
    sentences = re.split(r"(?<=[.!?])\s+|[\r\n•]+", c.description)
    operational = re.compile(r"язык|русск|казахск|английск|стоимост|\bцен[аыу]|тенге|₸|\bчас(?:а|ов|ы)?\b", re.I)
    return [s.strip() for s in sentences if 15 <= len(s.strip()) <= 500 and not operational.search(s)][:16]


def local_snippet(c: Contractor, r: MatchRequest) -> str | None:
    candidates = snippets(c)
    if not candidates:
        return None
    concrete = re.compile(r"\b(?:опыт|лет\b|специализ|авторск|репертуар|оборудов|свет|звук|сценар|импровиз|интерактив|юмор|развлечен|танц|актер|цветоч|флорист|классическ|современн|традици|делов|музык|театр|вместим)")
    def relevance(sentence: str):
        normalized = sentence.casefold().replace("ё", "е")
        return (int(format_mentioned(sentence, r.event_format)),
                len(set(concrete.findall(normalized))),
                int(bool(re.search(r"\d", sentence))))
    # max preserves source order for equal keys; greetings have no concrete signals.
    return max(candidates, key=relevance)


def explanation(c: Contractor, r: MatchRequest, quote: str | None) -> str:
    price = f"{c.price_from_kzt:,}".replace(",", " ")
    parts = [f"{c.name}: от {price} ₸ — в пределах бюджета", f"формат «{r.event_format}» указан в каталоге",
             f"на {r.date.strftime('%d.%m.%Y')} не отмечен занятым"]
    if r.language:
        parts.append(f"язык — {r.language}")
    if r.duration_hours is not None:
        parts.append(f"лимит {c.max_hours:g} ч покрывает {r.duration_hours:g} ч" if c.max_hours is not None
                     else "работа не привязана к часам присутствия")
    result = "; ".join(parts) + "."
    if quote:
        result += " В описании: «" + quote.rstrip(".!? ") + "»."
    return result


def make_card(c: Contractor, r: MatchRequest) -> Card:
    quote = local_snippet(c, r)
    facts = [Evidence(field="price_from_kzt", value=str(c.price_from_kzt)),
             Evidence(field="event_formats", value=r.event_format),
             Evidence(field="busy_dates", value=f"{r.date.isoformat()} отсутствует в списке занятых дат"),
             Evidence(field="ranking", value="Упоминание формата в описании → цена → ID; не рейтинг качества")]
    if r.language:
        facts.append(Evidence(field="languages", value=r.language))
    if r.duration_hours is not None:
        facts.append(Evidence(field="max_hours", value=str(c.max_hours) if c.max_hours is not None else "неприменимо"))
    if quote:
        facts.append(Evidence(field="description", value=quote))
    return Card(id=c.id, name=c.name, category=r.category, city=c.city,
                price_from_kzt=c.price_from_kzt, languages=list(c.languages), max_hours=c.max_hours,
                explanation=explanation(c, r, quote), evidence=facts,
                flags=Flags(synthetic=c.synthetic, city_imputed=c.city_imputed, price_imputed=c.price_imputed))


def match(r: MatchRequest, catalog: Catalog) -> tuple[MatchResponse, list[Contractor]]:
    catalog.validate_request(r)
    base = [c for c in catalog.contractors if c.city == r.city and r.category in c.categories]
    counts: Counter = Counter()
    eligible = []
    for contractor in base:
        reason = rejection(contractor, r)
        if reason:
            counts[reason] += 1
        else:
            eligible.append(contractor)
    eligible.sort(key=lambda c: (-int(format_mentioned(c.description, r.event_format)), c.price_from_kzt, c.id))
    selected = eligible[:3]
    if not base:
        status = "category_missing"
        message = f"В локации «{r.city}» категория «{r.category}» отсутствует в предоставленном каталоге. Выберите другую категорию или город."
    else:
        status = "matches_found" if eligible else "no_matches"
        message = f"По городу и категории: {len(base)}; подходят всем условиям: {len(eligible)}; показано: {len(selected)}."
        if len(eligible) < 3:
            details = "; ".join(f"{REASON_LABELS[code]} — {counts[code]}" for code in REASONS if counts[code])
            message += (" Последовательный отсев (каждый профиль учтён один раз): " + details + ".") if details else " В каталоге мало профилей этой категории в выбранном городе."
            hints = {"busy": "дату", "format": "формат", "budget": "бюджет", "language": "язык", "duration": "длительность"}
            changes = [hints[code] for code in REASONS if counts[code]]
            if changes:
                message += " Можно изменить " + ", ".join(changes) + "; новые варианты нужно проверить повторно."
        message += f" Занятость проверена на {r.date.strftime('%d.%m.%Y')} по учебному календарю; это не подтверждение брони."
    response = MatchResponse(status=status, message=message, total_in_category=len(base), eligible_count=len(eligible),
                             returned_count=len(selected), rejections=[Rejection(code=k, count=counts[k]) for k in REASONS],
                             cards=[make_card(c, r) for c in selected])
    return response, selected
