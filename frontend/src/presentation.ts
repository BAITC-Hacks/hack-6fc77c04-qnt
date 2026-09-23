import type { Options } from "./types";

// Translate labels only. Evidence values and their order remain exactly as received.
const evidenceLabels: Record<string, string> = {
  price_from_kzt: "Начальная цена, ₸",
  event_formats: "Формат мероприятия",
  busy_dates: "Занятость по календарю",
  ranking: "Основание порядка выдачи",
  languages: "Язык",
  max_hours: "Лимит длительности, ч",
  description: "Цитата из описания",
  city: "Город",
  category: "Категория",
  date: "Дата мероприятия",
  source: "Источник",
};
export function evidenceLabel(field: string) {
  return (
    evidenceLabels[field] ??
    (/^[a-z_]+$/i.test(field) ? "Факт из каталога" : field)
  );
}
export type FormValues = {
  city: string;
  date: string;
  event_format: string;
  category: string;
  budget_kzt: string;
  language: string;
  duration_hours: string;
};
export type FieldErrors = Partial<Record<keyof FormValues, string>>;
export const fieldIds: Record<keyof FormValues, string> = {
  city: "city",
  date: "date",
  event_format: "format",
  category: "category",
  budget_kzt: "budget",
  language: "language",
  duration_hours: "hours",
};
export function validateForm(form: FormValues, options: Options): FieldErrors {
  const errors: FieldErrors = {};
  if (!options.cities.includes(form.city))
    errors.city = "Выберите город из списка.";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.date) ||
    Number.isNaN(Date.parse(form.date)) ||
    new Date(form.date).toISOString().slice(0, 10) !== form.date ||
    form.date < options.date_min ||
    form.date > options.date_max
  )
    errors.date = "Выберите дату с 23 сентября по 31 декабря 2026 года.";
  if (!options.event_formats.includes(form.event_format))
    errors.event_format = "Выберите формат мероприятия.";
  if (!options.categories.includes(form.category))
    errors.category = "Выберите категорию из списка.";
  if (
    !Number.isSafeInteger(Number(form.budget_kzt)) ||
    Number(form.budget_kzt) <= 0
  )
    errors.budget_kzt = "Укажите целый бюджет больше нуля в тенге.";
  if (form.language && !options.languages.includes(form.language))
    errors.language = "Выберите язык из списка или снимите ограничение.";
  if (
    form.duration_hours !== "" &&
    (!Number.isFinite(Number(form.duration_hours)) ||
      Number(form.duration_hours) <= 0)
  )
    errors.duration_hours =
      "Укажите число часов больше нуля или оставьте поле пустым.";
  return errors;
}
