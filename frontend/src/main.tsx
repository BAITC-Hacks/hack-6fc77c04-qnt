import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { demo, getOptions, match } from "./api";
import { examples } from "./demo";
import type { Options, Match, Request, Reason } from "./types";
import {
  evidenceLabel,
  fieldIds,
  validateForm,
  type FieldErrors,
  type FormValues,
} from "./presentation";
import "./style.css";
const money = (value: number) => new Intl.NumberFormat("ru-RU").format(value);
const reasons: Record<Reason, string> = {
  busy: "Заняты в эту дату",
  format: "Другой формат",
  budget: "Выше бюджета",
  language: "Не подходит язык",
  duration: "Не подходит длительность",
};
function App() {
  const [options, setOptions] = useState<Options>();
  const [optionsError, setOptionsError] = useState("");
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<FormValues>({
    city: "Алматы",
    date: "2026-10-10",
    event_format: "корпоратив",
    category: "Ведущий",
    budget_kzt: "1000000",
    language: "русский",
    duration_hours: "4",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<Match>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const firstField = useRef<HTMLSelectElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setOptionsError("");
    getOptions(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setOptions(data);
          setForm((f) => ({
            ...f,
            city: data.cities.includes(f.city) ? f.city : data.cities[0] || "",
            category: data.categories.includes(f.category)
              ? f.category
              : data.categories[0] || "",
            event_format: data.event_formats.includes(f.event_format)
              ? f.event_format
              : data.event_formats[0] || "",
            language: data.languages.includes(f.language) ? f.language : "",
          }));
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setOptionsError(e.message);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => () => active.current?.abort(), []);
  function clear() {
    sequence.current++;
    active.current?.abort();
    setLoading(false);
    setResult(undefined);
    setError("");
  }
  function update(key: keyof typeof form, value: string) {
    clear();
    setFieldErrors((errors) => ({ ...errors, [key]: undefined }));
    setForm((f) => ({ ...f, [key]: value }));
  }
  function example(request: Request) {
    clear();
    setFieldErrors({});
    setForm({
      ...request,
      budget_kzt: String(request.budget_kzt),
      language: request.language ?? "",
      duration_hours:
        request.duration_hours === null ? "" : String(request.duration_hours),
    });
    firstField.current?.focus();
  }
  function showResults() {
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }
  function fieldProps(key: keyof FormValues, hint?: string) {
    return {
      "aria-invalid": fieldErrors[key] ? (true as const) : undefined,
      "aria-describedby":
        [hint, fieldErrors[key] ? `${fieldIds[key]}-error` : undefined]
          .filter(Boolean)
          .join(" ") || undefined,
    };
  }
  function fieldError(key: keyof FormValues) {
    return fieldErrors[key] ? (
      <span className="field-error" id={`${fieldIds[key]}-error`}>
        {fieldErrors[key]}
      </span>
    ) : null;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    clear();
    if (!options) return;
    const validation = validateForm(form, options);
    setFieldErrors(validation);
    const invalidField = Object.keys(validation)[0] as
      keyof FormValues | undefined;
    if (invalidField) {
      document.getElementById(fieldIds[invalidField])?.focus();
      return;
    }
    const budget = Number(form.budget_kzt),
      hours = form.duration_hours === "" ? null : Number(form.duration_hours);
    const controller = new AbortController();
    active.current = controller;
    const version = ++sequence.current;
    setLoading(true);
    try {
      const data = await match(
        {
          ...form,
          budget_kzt: budget,
          language: form.language || null,
          duration_hours: hours,
        },
        controller.signal,
      );
      if (sequence.current === version) setResult(data);
    } catch (e) {
      if (sequence.current === version && !controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Не удалось выполнить запрос.",
        );
    } finally {
      if (sequence.current === version) setLoading(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#form-title">
        К параметрам мероприятия
      </a>
      {demo && (
        <div className="demo" role="note">
          Демонстрационные ответы интерфейса{" "}
          <span>· Вымышленные примеры, без сервера и AI</span>
        </div>
      )}
      <header>
        <a className="brand" href="./" aria-label="QNT Match — на главную">
          <img src="/favicon.svg" width="40" height="40" alt="" />
          <span>
            QNT <span className="brand-light">Match</span>
          </span>
        </a>
        <span className="tag">
          Firebird <span aria-hidden="true">/</span> кейс №6
        </span>
      </header>
      <main>
        <div className="intro">
          <p className="eyebrow">КОМАНДА QNT · УМНЫЙ ПОДБОР</p>
          <h1>
            Ваше событие.
            <br />
            <span>Подходящие люди.</span>
          </h1>
          <p>
            До трёх подрядчиков под ваши условия.
            <br className="desktop" /> С ценами, объяснениями и фактами из
            каталога.
          </p>
        </div>
        <div className="layout">
          <section className="panel" aria-labelledby="form-title">
            <div className="section-title">
              <span className="step" aria-hidden="true">
                01
              </span>
              <h2 id="form-title" tabIndex={-1}>
                Параметры мероприятия
              </h2>
            </div>
            {!options && !optionsError && (
              <p role="status">Загружаем справочники…</p>
            )}
            {optionsError && (
              <div role="alert" className="error">
                <p>{optionsError}</p>
                <button onClick={() => setReload((r) => r + 1)}>
                  Повторить загрузку
                </button>
              </div>
            )}
            {options && (
              <form onSubmit={submit} noValidate>
                <p className="form-note">Первые пять полей обязательны.</p>
                <div className="fields">
                  <label htmlFor="city">
                    Город
                    <select
                      ref={firstField}
                      id="city"
                      {...fieldProps("city")}
                      required
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                    >
                      {options.cities.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    {fieldError("city")}
                  </label>
                  <label htmlFor="date">
                    Дата
                    <input
                      id="date"
                      {...fieldProps("date", "date-hint")}
                      type="date"
                      required
                      min={options.date_min}
                      max={options.date_max}
                      value={form.date}
                      onChange={(e) => update("date", e.target.value)}
                    />
                    {fieldError("date")}
                  </label>
                  <label htmlFor="format">
                    Формат
                    <select
                      id="format"
                      {...fieldProps("event_format")}
                      required
                      value={form.event_format}
                      onChange={(e) => update("event_format", e.target.value)}
                    >
                      {options.event_formats.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    {fieldError("event_format")}
                  </label>
                  <label htmlFor="category">
                    Категория
                    <select
                      id="category"
                      {...fieldProps("category")}
                      required
                      value={form.category}
                      onChange={(e) => update("category", e.target.value)}
                    >
                      {options.categories.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    {fieldError("category")}
                  </label>
                  <label className="wide" htmlFor="budget">
                    Бюджет на одного подрядчика, ₸
                    <input
                      id="budget"
                      {...fieldProps("budget_kzt", "budget-hint")}
                      type="number"
                      inputMode="numeric"
                      required
                      min="1"
                      step="1"
                      value={form.budget_kzt}
                      onChange={(e) => update("budget_kzt", e.target.value)}
                    />
                    <small id="budget-hint">
                      За мероприятие. Цена в карточке указана «от».
                    </small>
                    {fieldError("budget_kzt")}
                  </label>
                  <label htmlFor="language">
                    Язык <small>необязательно</small>
                    <select
                      id="language"
                      {...fieldProps("language")}
                      value={form.language}
                      onChange={(e) => update("language", e.target.value)}
                    >
                      <option value="">Без ограничения</option>
                      {options.languages.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    {fieldError("language")}
                  </label>
                  <label htmlFor="hours">
                    Часы <small>необязательно</small>
                    <input
                      id="hours"
                      {...fieldProps("duration_hours")}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="Без ограничения"
                      value={form.duration_hours}
                      onChange={(e) => update("duration_hours", e.target.value)}
                    />
                    {fieldError("duration_hours")}
                  </label>
                </div>
                <p className="hint" id="date-hint">
                  Календарь: 23 сентября — 31 декабря 2026. Свободная дата в
                  каталоге не подтверждает бронирование.
                </p>
                <button className="primary" type="submit" disabled={loading}>
                  {loading ? "Подбираем…" : "Подобрать подрядчиков"}
                  <span aria-hidden="true">↗</span>
                </button>
                <div className="request-feedback">
                  <div role="status" aria-atomic="true">
                    {loading
                      ? "Проверяем условия. Ожидание — до 12 секунд."
                      : result
                        ? `Подбор готов. Показано вариантов: ${result.returned_count}.`
                        : "Параметры можно менять и проверять снова."}
                  </div>
                  {(result || loading) && (
                    <button
                      type="button"
                      className="results-link"
                      onClick={showResults}
                    >
                      К результатам ↓
                    </button>
                  )}
                </div>
                {error && (
                  <div className="error" role="alert">
                    <strong>Не удалось выполнить подбор</strong>
                    <p>{error}</p>
                    <span>Параметры сохранены. Повторите попытку.</span>
                  </div>
                )}
              </form>
            )}
            <div className="examples">
              <p>Попробуйте готовый пример</p>
              <div>
                {examples.map((e) => (
                  <button
                    key={e.title}
                    disabled={!options}
                    onClick={() => example(e.request)}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
              <small>Пример заполняет форму. Нажмите кнопку подбора.</small>
            </div>
          </section>
          <section
            className="results"
            aria-labelledby="results-title"
            aria-busy={loading}
          >
            <div className="section-title">
              <span className="step" aria-hidden="true">
                02
              </span>
              <h2 id="results-title" ref={resultsHeading} tabIndex={-1}>
                Ваш подбор
              </h2>
            </div>
            {loading && (
              <div className="status">
                <span className="status-dot" aria-hidden="true" /> Проверяем
                условия…
              </div>
            )}
            {result && (
              <div className={`summary summary-${result.status}`}>
                <p className="eyebrow">
                  {result.status === "matches_found"
                    ? `НАЙДЕНО: ${result.eligible_count} · ПОКАЗАНО: ${result.returned_count}`
                    : result.status === "category_missing"
                      ? "КАТЕГОРИИ НЕТ В ЭТОМ ГОРОДЕ"
                      : "НЕТ СОВПАДЕНИЙ ПО УСЛОВИЯМ"}
                </p>
                <p>{result.message}</p>
              </div>
            )}
            {error && (
              <p className="results-note">
                Подбор не выполнен. Проверьте сообщение у формы и повторите
                запрос.
              </p>
            )}
            {!result && !loading && !error && (
              <div className="empty">
                <span className="empty-icon" aria-hidden="true">
                  ✳
                </span>
                <h3>У каждого выбора — основания</h3>
                <p>
                  Здесь появятся кандидаты, цены
                  <br /> и факты, на которых основан подбор.
                </p>
                <div className="pills">
                  <span>До 3 вариантов</span>
                  <span>Прозрачные условия</span>
                </div>
              </div>
            )}
            {result?.cards.map((card, index) => (
              <article className="card" key={card.id}>
                <div className="card-top">
                  <div>
                    <p className="meta">
                      <span className="card-number" aria-hidden="true">
                        0{index + 1}
                      </span>
                      {card.category} · {card.city}
                    </p>
                    <h3>{card.name}</h3>
                  </div>
                  <strong className="price">
                    от {money(card.price_from_kzt)} ₸
                  </strong>
                </div>
                <p>{card.explanation}</p>
                <div className="pills">
                  <span className="mode">
                    {card.explanation_mode === "ai"
                      ? "AI · цитату выбрала модель"
                      : "local · объяснение по правилам"}
                  </span>
                  {card.flags.synthetic && (
                    <span>Синтетический профиль · synthetic</span>
                  )}
                  {card.flags.city_imputed && (
                    <span>Город дополнен · city_imputed</span>
                  )}
                  {card.flags.price_imputed && (
                    <span>Цена дополнена · price_imputed</span>
                  )}
                </div>
                <details>
                  <summary>Факты-основания</summary>
                  <dl>
                    <div>
                      <dt>Языки профиля</dt>
                      <dd>{card.languages.join(", ") || "Не указаны"}</dd>
                    </div>
                    <div>
                      <dt>Лимит часов</dt>
                      <dd>{card.max_hours ?? "Ограничение неприменимо"}</dd>
                    </div>
                    {card.evidence.map((e, i) => (
                      <div key={i}>
                        <dt>{evidenceLabel(e.field)}</dt>
                        <dd>{e.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </article>
            ))}
            {result && (
              <>
                <details className="filters">
                  <summary>Как условия повлияли на подбор</summary>
                  <p>
                    В городе и категории: {result.total_in_category}.
                    Последовательные фильтры: каждый исключённый кандидат
                    учитывается только по первой причине.
                  </p>
                  <ul>
                    {result.rejections.map((r) => (
                      <li key={r.code}>
                        {reasons[r.code]} <strong>{r.count}</strong>
                      </li>
                    ))}
                  </ul>
                </details>
                {result.returned_count === 0 && (
                  <button onClick={() => firstField.current?.focus()}>
                    Изменить условия ↑
                  </button>
                )}
              </>
            )}
          </section>
        </div>
        <footer>
          <span className="footer-brand">
            QNT Match <span>· Firebird №6</span>
          </span>
          <p>
            Источник: учебный каталог организатора
            {options ? ` · ${options.dataset_count} профилей` : ""}.{" "}
            {demo && "Здесь показаны только отдельные вымышленные фикстуры."}{" "}
            Подбор не является бронированием.
          </p>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
