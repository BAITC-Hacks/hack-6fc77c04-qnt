from __future__ import annotations

import re
from datetime import date as EventDate
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DATE_MIN = EventDate(2026, 9, 23)
DATE_MAX = EventDate(2026, 12, 31)
ReasonCode = Literal["busy", "format", "budget", "language", "duration"]


class MatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    city: str = Field(min_length=1, max_length=80)
    date: EventDate
    event_format: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=80)
    budget_kzt: int = Field(gt=0)
    language: str | None = Field(default=None, min_length=1, max_length=80)
    duration_hours: float | None = Field(default=None, gt=0)

    @field_validator("date", mode="before")
    @classmethod
    def parse_date(cls, value):
        if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            value = EventDate.fromisoformat(value)
        if type(value) is not EventDate or not DATE_MIN <= value <= DATE_MAX:
            raise ValueError("Дата должна быть между 2026-09-23 и 2026-12-31")
        return value


class Flags(BaseModel):
    synthetic: bool
    city_imputed: bool
    price_imputed: bool


class Evidence(BaseModel):
    field: str
    value: str


class Card(BaseModel):
    id: str
    name: str
    category: str
    city: str
    price_from_kzt: int
    languages: list[str]
    max_hours: float | None
    explanation: str
    explanation_mode: Literal["ai", "local"] = "local"
    evidence: list[Evidence]
    flags: Flags


class Rejection(BaseModel):
    code: ReasonCode
    count: int


class MatchResponse(BaseModel):
    status: Literal["matches_found", "category_missing", "no_matches"]
    message: str
    total_in_category: int
    eligible_count: int
    returned_count: int
    rejections: list[Rejection]
    cards: list[Card]
