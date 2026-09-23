import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demo, getOptions, match } from './api';
import { examples } from './demo';
import type { Options, Match, Request, Reason } from './types';
import './style.css';
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const reasons: Record<Reason, string> = { busy: 'Заняты в эту дату', format: 'Другой формат', budget: 'Выше бюджета', language: 'Не подходит язык', duration: 'Не подходит длительность' };
function App() {
 const [options, setOptions] = useState<Options>();
 const [optionsError, setOptionsError] = useState('');
 const [reload, setReload] = useState(0);
 const [form, setForm] = useState({ city: 'Алматы', date: '2026-10-10', event_format: 'корпоратив', category: 'Ведущий', budget_kzt: '1000000', language: 'русский', duration_hours: '4' });
 const [result, setResult] = useState<Match>();
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);
 const active = useRef<AbortController | null>(null);
 const sequence = useRef(0);
 const firstField = useRef<HTMLSelectElement>(null);
 useEffect(() => {
  const controller = new AbortController();
  setOptionsError('');
  getOptions(controller.signal).then(data => { if (!controller.signal.aborted) { setOptions(data); setForm(f => ({ ...f, city: data.cities.includes(f.city) ? f.city : data.cities[0] || '', category: data.categories.includes(f.category) ? f.category : data.categories[0] || '', event_format: data.event_formats.includes(f.event_format) ? f.event_format : data.event_formats[0] || '', language: data.languages.includes(f.language) ? f.language : '' })); } }).catch(e => { if (!controller.signal.aborted) setOptionsError(e.message); });
  return () => controller.abort();
 }, [reload]);
 useEffect(() => () => active.current?.abort(), []);
 function clear() { sequence.current++; active.current?.abort(); setLoading(false); setResult(undefined); setError(''); }
 function update(key: keyof typeof form, value: string) { clear(); setForm(f => ({ ...f, [key]: value })); }
 function example(request: Request) { clear(); setForm({ ...request, budget_kzt: String(request.budget_kzt), language: request.language ?? '', duration_hours: request.duration_hours === null ? '' : String(request.duration_hours) }); firstField.current?.focus(); }
 async function submit(event: React.FormEvent) {
  event.preventDefault(); clear();
  if (!options) return;
  const budget = Number(form.budget_kzt), hours = form.duration_hours === '' ? null : Number(form.duration_hours);
  if (!Number.isSafeInteger(budget) || budget <= 0 || (hours !== null && (!Number.isFinite(hours) || hours <= 0)) || form.date < options.date_min || form.date > options.date_max || !options.cities.includes(form.city) || !options.categories.includes(form.category) || !options.event_formats.includes(form.event_format) || (form.language && !options.languages.includes(form.language))) { setError('Проверьте значения: бюджет — положительное целое число, часы — больше нуля, дата — в пределах календаря.'); return; }
  const controller = new AbortController(); active.current = controller; const version = ++sequence.current; setLoading(true);
  try { const data = await match({ ...form, budget_kzt: budget, language: form.language || null, duration_hours: hours }, controller.signal); if (sequence.current === version) setResult(data); }
  catch (e) { if (sequence.current === version && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос.'); }
  finally { if (sequence.current === version) setLoading(false); }
 }
 return <>
  {demo && <div className="demo" role="note">Демонстрационные ответы интерфейса <span>· Вымышленные примеры, без сервера и AI</span></div>}
  <header><a className="brand" href="./"><span className="mark">F</span> Firebird</a><span className="tag">QNT / подбор подрядчиков</span></header>
  <main><div className="intro"><p className="eyebrow">ВАШЕ СОБЫТИЕ НАЧИНАЕТСЯ ЗДЕСЬ</p><h1>Нужные люди.<br/><span>Под ваше событие.</span></h1><p>Задайте условия — получите до трёх подрядчиков<br className="desktop"/> с понятным объяснением каждого выбора.</p></div>
  <div className="layout"><section className="panel" aria-labelledby="form-title"><div className="section-title"><span className="step">01</span><h2 id="form-title">Параметры мероприятия</h2></div>
  {!options && !optionsError && <p role="status">Загружаем справочники…</p>}
  {optionsError && <div role="alert" className="error"><p>{optionsError}</p><button onClick={() => setReload(r => r + 1)}>Повторить загрузку</button></div>}
  {options && <form onSubmit={submit}><div className="fields">
   <label htmlFor="city">Город<select ref={firstField} id="city" required value={form.city} onChange={e => update('city', e.target.value)}>{options.cities.map(v => <option key={v}>{v}</option>)}</select></label>
   <label htmlFor="date">Дата<input id="date" type="date" required min={options.date_min} max={options.date_max} value={form.date} onChange={e => update('date', e.target.value)}/></label>
   <label htmlFor="format">Формат<select id="format" required value={form.event_format} onChange={e => update('event_format', e.target.value)}>{options.event_formats.map(v => <option key={v}>{v}</option>)}</select></label>
   <label htmlFor="category">Категория<select id="category" required value={form.category} onChange={e => update('category', e.target.value)}>{options.categories.map(v => <option key={v}>{v}</option>)}</select></label>
   <label className="wide" htmlFor="budget">Бюджет на одного подрядчика, ₸<input id="budget" type="number" inputMode="numeric" required min="1" step="1" value={form.budget_kzt} onChange={e => update('budget_kzt', e.target.value)}/><small>За мероприятие. Цена в карточке указана «от».</small></label>
   <label htmlFor="language">Язык <small>необязательно</small><select id="language" value={form.language} onChange={e => update('language', e.target.value)}><option value="">Без ограничения</option>{options.languages.map(v => <option key={v}>{v}</option>)}</select></label>
   <label htmlFor="hours">Часы <small>необязательно</small><input id="hours" type="number" min="0.01" step="any" placeholder="Без ограничения" value={form.duration_hours} onChange={e => update('duration_hours', e.target.value)}/></label>
  </div><p className="hint">Календарь: 23 сентября — 31 декабря 2026. Наличие даты в календаре не подтверждает бронирование.</p><button className="primary" type="submit">{loading ? 'Подбираем… Повторить запрос' : 'Подобрать подрядчиков'}<span aria-hidden="true">↗</span></button></form>}
  <div className="examples"><p>Попробуйте готовый пример</p><div>{examples.map(e => <button key={e.title} disabled={!options} onClick={() => example(e.request)}>{e.title}</button>)}</div><small>Пример заполняет форму. Нажмите кнопку подбора.</small></div></section>
  <section className="results" aria-labelledby="results-title" aria-busy={loading}><div className="section-title"><span className="step">02</span><h2 id="results-title">Ваш подбор</h2></div>
  <div aria-live="polite" aria-atomic="true">{loading && <p className="status">Проверяем условия. Ожидание — до 12 секунд…</p>}{result && <div className="summary"><p className="eyebrow">{result.status === 'matches_found' ? `НАЙДЕНО: ${result.eligible_count} · ПОКАЗАНО: ${result.returned_count}` : result.status === 'category_missing' ? 'КАТЕГОРИИ НЕТ В ЭТОМ ГОРОДЕ' : 'НЕТ СОВПАДЕНИЙ ПО УСЛОВИЯМ'}</p><p>{result.message}</p></div>}</div>
  {error && <div className="error" role="alert">{error}<p>Параметры сохранены. Повторите подбор.</p></div>}
  {!result && !loading && !error && <div className="empty"><span className="empty-icon" aria-hidden="true">✳</span><h3>У каждого выбора — основания</h3><p>Здесь появятся кандидаты, цены<br/> и факты, на которых основан подбор.</p><div className="pills"><span>До 3 вариантов</span><span>Прозрачные условия</span></div></div>}
  {result?.cards.map(card => <article className="card" key={card.id}><div className="card-top"><div><p className="meta">{card.category} · {card.city}</p><h3>{card.name}</h3></div><strong className="price">от {money(card.price_from_kzt)} ₸</strong></div><p>{card.explanation}</p><div className="pills"><span>{card.explanation_mode === 'ai' ? 'AI · выбор фактов' : 'local · локальное объяснение'}</span>{card.flags.synthetic && <span>synthetic · синтетический профиль</span>}{card.flags.city_imputed && <span>city_imputed · город дополнен</span>}{card.flags.price_imputed && <span>price_imputed · цена дополнена</span>}</div><details><summary>Факты-основания</summary><dl><dt>Языки</dt><dd>{card.languages.join(', ') || 'Не указаны'}</dd><dt>Лимит часов</dt><dd>{card.max_hours ?? 'Ограничение неприменимо'}</dd>{card.evidence.map((e, i) => <div key={i}><dt>{e.field}</dt><dd>{e.value}</dd></div>)}</dl></details></article>)}
  {result && <><details className="filters"><summary>Как условия повлияли на подбор</summary><p>В городе и категории: {result.total_in_category}. Последовательные фильтры: каждый исключённый кандидат учитывается только по первой причине.</p><ul>{result.rejections.map(r => <li key={r.code}>{reasons[r.code]} <strong>{r.count}</strong></li>)}</ul></details>{result.returned_count === 0 && <button onClick={() => firstField.current?.focus()}>Изменить условия ↑</button>}</>}
  </section></div><footer>Источник: учебный каталог организатора{options ? ` · ${options.dataset_count} профилей` : ''}. {demo && 'Здесь показаны только отдельные вымышленные фикстуры.'} Подбор не является бронированием.</footer></main>
 </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
