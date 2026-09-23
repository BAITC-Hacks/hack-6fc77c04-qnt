from __future__ import annotations

from datetime import timedelta

from .catalog import Catalog
from .matching import match
from .models import DATE_MAX, DATE_MIN, MatchRequest, RecoveryResponse, RecoverySuggestion


def recovery_suggestions(request: MatchRequest, catalog: Catalog) -> RecoveryResponse:
    """Offer only successful, explicitly single-field changes to an empty search.

    The ordinary matcher verifies every proposal. No model is involved, and the
    caller's request is never relaxed or changed in place. Calendar availability
    has the same educational-data limitation as an ordinary match.
    """
    original, _ = match(request, catalog)
    suggestions: list[RecoverySuggestion] = []
    if original.status != "no_matches":
        return RecoveryResponse(suggestions=suggestions)

    days = (DATE_MIN + timedelta(days=offset)
            for offset in range((DATE_MAX - DATE_MIN).days + 1))
    # Prefer a future date when two equally near alternatives both work.
    nearest = sorted((day for day in days if day != request.date),
                     key=lambda day: (abs((day - request.date).days), day < request.date))
    for day in nearest:
        candidate = request.model_copy(update={"date": day})
        result, _ = match(candidate, catalog)
        if result.eligible_count:
            suggestions.append(RecoverySuggestion(
                request=candidate, changed_fields=["date"], eligible_count=result.eligible_count))
            break

    prices = sorted({c.price_from_kzt for c in catalog.contractors
                     if c.city == request.city and request.category in c.categories
                     and c.price_from_kzt > request.budget_kzt})
    for price in prices:
        candidate = request.model_copy(update={"budget_kzt": price})
        result, _ = match(candidate, catalog)
        if result.eligible_count:
            suggestions.append(RecoverySuggestion(
                request=candidate, changed_fields=["budget_kzt"], eligible_count=result.eligible_count))
            break

    return RecoveryResponse(suggestions=suggestions)
