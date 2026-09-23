# Firebird API v1 — общий контракт

Статус: согласованный MVP, предлагаемый контракт реализации. Ни один endpoint пока не объявляется реализованным. Имена полей фиксированы для двух параллельных задач. Все текстовые значения справочников берём из CSV на русском. JSON — UTF-8, числа — числа, не форматированные строки.

## GET /api/options

200:

```ts
type Options = {
  cities: string[];
  categories: string[]; // все категории, не только доступные в выбранном городе
  event_formats: string[];
  languages: string[];
  date_min: "2026-09-23";
  date_max: "2026-12-31";
  dataset_count: 66;
};
```

Массивы отсортированы одинаковым серверным правилом при каждом запуске. UI сохраняет серверный порядок. Не скрывать отсутствующую в городе категорию: её выбор должен позволять показать соответствующий исход.

## POST /api/match

```json
{
  "city": "Алматы",
  "date": "2026-10-10",
  "event_format": "корпоратив",
  "category": "Ведущий",
  "budget_kzt": 1000000,
  "language": "русский",
  "duration_hours": 4
}
```

Пять первых смысловых параметров обязательны: city, date, event_format, category, budget_kzt. language и duration_hours необязательны: отсутствуют или null. UI передаёт null, не пустую строку. Бюджет — положительное целое число; часы — положительное конечное число. Неизвестные значения, отрицательные числа и даты вне окна — 422. Сервер запрещает неожиданные поля и не приводит строки/булевы значения к числам молча.

200 для всех трёх корректных поисковых исходов:

```ts
type MatchStatus = "matches_found" | "category_missing" | "no_matches";
type ReasonCode = "busy" | "format" | "budget" | "language" | "duration";
type MatchResponse = {
  status: MatchStatus;
  message: string; // готовое объяснение результата и, если нужно, нехватки карточек
  total_in_category: number; // после города+категории
  eligible_count: number; // после всех условий, ДО ограничения выдачи тремя
  returned_count: number; // cards.length, 0..3
  rejections: { code: ReasonCode; count: number }[];
  cards: {
    id: string;
    name: string; // из anon_name
    category: string; // запрошенная категория
    city: string;
    price_from_kzt: number;
    languages: string[];
    max_hours: number | null;
    explanation: string; // 1–2 предложения, plain text
    explanation_mode: "ai" | "local";
    evidence: { field: string; value: string }[]; // точные цитаты/структурированные факты
    flags: { synthetic: boolean; city_imputed: boolean; price_imputed: boolean };
  }[];
};
```

`rejections` всегда содержит пять кодов в порядке busy, format, budget, language, duration, включая нулевые. Каждый подрядчик относится только к первому проваленному фильтру в этом порядке. Инвариант: сумма count + eligible_count = total_in_category. В category_missing все числа 0, cards пуст. В no_matches total_in_category > 0, eligible_count = 0. В matches_found eligible_count > 0 и returned_count = min(3, eligible_count).

Ошибки 422/503:

```ts
type ApiError = { error: { code: "validation_error" | "service_unavailable"; message: string } };
```

Для 422 сервер нормализует стандартные ошибки валидатора в этот envelope. UI также умеет показать общее сообщение при сетевом сбое/не-JSON ответе, не выдавая ошибку за отсутствие подрядчиков. Ошибка AI сама по себе не даёт 503: возвращается локальное объяснение. 503 — сервер не может выполнить основной подбор.

## GET /api/health

200: `{ "status": "ok", "dataset_count": 66 }`. Без секретов, личных путей и внутренних exception strings. Если каталог не прошёл валидацию, готовность не должна возвращать ok.

## Правила UI и проверки

- Локальная форма не заменяет серверную валидацию.
- Время ожидания UI 12 секунд; сервер укладывает AI-запрос в меньший общий бюджет.
- Отмена/смена запроса не должна позволять старому ответу перезаписать новый.
- Только текстовый рендеринг объяснений, без unsafe HTML.
- Видно «от … ₸», источник учебного каталога, синтетические/дополненные данные и режим объяснения.
- Режим UI-моков включается ТОЛЬКО явным `VITE_DEMO_MODE=true`, с постоянной надписью «Демонстрационные ответы интерфейса». По умолчанию выключен. При сбое реального API запрещено скрыто переключаться на моки.
- Моки соответствуют этой схеме, но не являются доказательством работы сервера или AI. Полный исходный каталог в frontend не копируется.
