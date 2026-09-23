import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demo, getOptions, match } from './api';
import { examples } from './demo';
import type { Options, Match, Request, Reason, Card } from './types';
import './style.css';
import { ContractorCard, ResultSummary } from './ResultDetails';
import { EstimatePanel } from './EstimatePanel';
import { addEstimateItem, replaceEstimateItem, removeEstimateItem, readEstimate, saveEstimate } from './estimate';
import type { EstimateItem } from './estimate';
const reasons: Record<Reason, string> = { busy: 'Заняты в эту дату', format: 'Другой формат', budget: 'Выше бюджета', language: 'Не подходит язык', duration: 'Не подходит длительность' };
function App() {
 const [options, setOptions] = useState<Options>();
 const [optionsError, setOptionsError] = useState('');
 const [reload, setReload] = useState(0);
 const [form, setForm] = useState({ city: 'Алматы', date: '2026-10-10', event_format: 'корпоратив', category: 'Ведущий', budget_kzt: '1000000', language: 'русский', duration_hours: '4' });
 const [result, setResult] = useState<Match>();
 const [resultRequest, setResultRequest] = useState<Request>();
 const [estimate, setEstimate] = useState<EstimateItem[]>(() => demo ? [] : readEstimate());
 const [replacingId, setReplacingId] = useState<string>();
 const [estimateNotice, setEstimateNotice] = useState('');
 const [pendingSelection, setPendingSelection] = useState<{card: Card; request: Request}>();
 const [storageAvailable, setStorageAvailable] = useState(true);
 const estimateSection = useRef<HTMLDivElement>(null);
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);
 const [compact, setCompact] = useState(false);
 const active = useRef<AbortController | null>(null);
 const sequence = useRef(0);
 const resultHeader = useRef<HTMLDivElement>(null);
 const outcome = useRef<HTMLHeadingElement>(null);
 const firstField = useRef<HTMLSelectElement>(null);
 useEffect(() => {
  const controller = new AbortController();
  setOptionsError('');
  getOptions(controller.signal).then(data => { if (!controller.signal.aborted) { setOptions(data); setForm(f => ({ ...f, city: data.cities.includes(f.city) ? f.city : data.cities[0] || '', category: data.categories.includes(f.category) ? f.category : data.categories[0] || '', event_format: data.event_formats.includes(f.event_format) ? f.event_format : data.event_formats[0] || '', language: data.languages.includes(f.language) ? f.language : '' })); } }).catch(e => { if (!controller.signal.aborted) setOptionsError(e.message); });
  return () => controller.abort();
 }, [reload]);
 useEffect(() => () => active.current?.abort(), []);
 useEffect(() => {
  if (compact) {
   outcome.current?.focus({ preventScroll: true });
   window.scrollTo({ top: 0, behavior: 'instant' });
  }
 }, [compact]);
 useEffect(() => {
  if (!compact || !resultHeader.current) return;
  const root = document.documentElement;
  const previous = root.style.scrollPaddingTop;
  const observer = new ResizeObserver(([entry]) => {
   root.style.scrollPaddingTop = `${entry.target.getBoundingClientRect().height + 16}px`;
  });
  observer.observe(resultHeader.current);
  return () => { observer.disconnect(); root.style.scrollPaddingTop = previous; };
 }, [compact]);
 function editConditions() {
  setCompact(false);
  requestAnimationFrame(() => firstField.current?.focus());
 }
 useEffect(() => { setStorageAvailable(demo || saveEstimate(estimate)); }, [estimate]);
 useEffect(() => { if (pendingSelection) { estimateSection.current?.focus({preventScroll:true}); estimateSection.current?.scrollIntoView({block:'start'}); } }, [pendingSelection]);
 function clear() { sequence.current++; active.current?.abort(); setLoading(false); setResult(undefined); setResultRequest(undefined); setPendingSelection(undefined); setError(''); }
 function update(key: keyof typeof form, value: string) { clear(); if (['city', 'date', 'event_format', 'category'].includes(key)) { setReplacingId(undefined); setEstimateNotice(''); } setForm(f => ({ ...f, [key]: value })); }
 function example(request: Request) { editConditions(); clear(); setReplacingId(undefined); setForm({ ...request, budget_kzt: String(request.budget_kzt), language: request.language ?? '', duration_hours: request.duration_hours === null ? '' : String(request.duration_hours) }); firstField.current?.focus(); }
 function replaceFromEstimate(item: EstimateItem) {
  example(item.request);
  setReplacingId(item.contractor.id);
  setEstimateNotice(`Выберите замену для «${item.contractor.name}». Параметры поиска заполнены; нажмите «Подобрать подрядчиков». Текущая позиция сохранена до выбора замены.`);
 }
 function choose(card: Card) {
  if (!resultRequest) return;
  const next = replacingId
   ? replaceEstimateItem(estimate, replacingId, card, resultRequest)
   : addEstimateItem(estimate, card, resultRequest);
  if (next.status === 'incompatible') {
   setPendingSelection({card, request: resultRequest});
   setEstimateNotice('Этот подбор относится к другому событию. Текущая смета сохранена.');
   return;
  }
  if (next.status === 'added' || next.status === 'replaced') {
   setEstimate(next.items); setReplacingId(undefined); setPendingSelection(undefined);
   setEstimateNotice(next.status === 'replaced' ? `Позиция заменена на «${card.name}».` : `«${card.name}» добавлен в предварительную смету.`);
  } else {
   setEstimateNotice(next.status === 'duplicate' ? 'Этот подрядчик уже есть в смете.' : 'Замена не выполнена. Откройте подбор замены из сметы ещё раз.');
  }
 }
 function startNewEstimate() {
  if (!pendingSelection) return;
  const next = addEstimateItem([], pendingSelection.card, pendingSelection.request);
  if (next.status === 'added') { setEstimate(next.items); setReplacingId(undefined); setPendingSelection(undefined); setEstimateNotice('Создана новая предварительная смета.'); }
 }
 function removeFromEstimate(id: string) {
  setEstimate(items => removeEstimateItem(items, id));
  if (replacingId === id) setReplacingId(undefined);
  setPendingSelection(undefined); setEstimateNotice('Позиция удалена из сметы.');
 }
 async function submit(event: React.FormEvent) {
  event.preventDefault(); clear();
  if (!options) return;
  const budget = Number(form.budget_kzt), hours = form.duration_hours === '' ? null : Number(form.duration_hours);
  if (!Number.isSafeInteger(budget) || budget <= 0 || (hours !== null && (!Number.isFinite(hours) || hours <= 0)) || form.date < options.date_min || form.date > options.date_max || !options.cities.includes(form.city) || !options.categories.includes(form.category) || !options.event_formats.includes(form.event_format) || (form.language && !options.languages.includes(form.language))) { setError('Проверьте значения: бюджет — положительное целое число, часы — больше нуля, дата — в пределах календаря.'); return; }
  const controller = new AbortController(); active.current = controller; const version = ++sequence.current; setLoading(true);
  const request: Request = { ...form, budget_kzt: budget, language: form.language || null, duration_hours: hours };
  try { const data = await match(request, controller.signal); if (sequence.current === version) { setResult(data); setResultRequest(request); setCompact(true); } }
  catch (e) { if (sequence.current === version && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос.'); }
  finally { if (sequence.current === version) setLoading(false); }
 }
 return <>
  {demo && <div className="demo" role="note">Демонстрационные ответы интерфейса <span>· Вымышленные примеры, без сервера и AI</span></div>}
  <main className={compact ? 'has-results' : undefined}><div className="hero" ref={resultHeader}><header><a className="brand" href="./"><span className="mark" aria-hidden="true">✳</span> QNT <span className="brand-case">/ Firebird</span></a>{compact ? <button className="edit-conditions" onClick={editConditions} aria-controls="event-form" aria-expanded={false}>Изменить условия <span aria-hidden="true">↗</span></button> : <span className="tag">СОБЫТИЯ НАЧИНАЮТСЯ С ЛЮДЕЙ</span>}<button className="estimate-nav" type="button" onClick={() => { estimateSection.current?.focus({preventScroll:true}); estimateSection.current?.scrollIntoView({block: 'start'}); }}>Смета · {estimate.length}</button></header>
  {compact && <section className="conditions" aria-labelledby="conditions-title">
   <h1 id="conditions-title" className="sr-only">Условия вашего события</h1>
   <dl className="conditions-list" tabIndex={0} aria-label="Условия подбора; на узком экране список прокручивается по горизонтали">
    <div><dt>Город</dt><dd>{form.city}</dd></div><div><dt>Дата</dt><dd>{form.date.split('-').reverse().join('.')}</dd></div>
    <div><dt>Формат</dt><dd>{form.event_format}</dd></div><div><dt>Категория</dt><dd>{form.category}</dd></div>
    <div><dt>Бюджет на одного</dt><dd>до {new Intl.NumberFormat('ru-RU').format(Number(form.budget_kzt))} ₸</dd></div>
    <div><dt>Язык</dt><dd>{form.language || 'Без ограничения'}</dd></div><div><dt>Длительность</dt><dd>{form.duration_hours ? `${form.duration_hours} ч` : 'Без ограничения'}</dd></div>
   </dl>
  </section>}
  <div className="hero-content" hidden={compact}><div className="intro"><div className="intro-copy"><p className="eyebrow">ВАШЕ СОБЫТИЕ НАЧИНАЕТСЯ ЗДЕСЬ</p><h1>Нужные люди.<br/><span>Под ваше событие.</span></h1><p>Задайте условия — получите до трёх подрядчиков<br className="desktop"/> с понятным объяснением каждого выбора.</p></div><div className="benefits"><div><span aria-hidden="true">♧</span>Проверяем<br/>по вашим условиям</div><div><span aria-hidden="true">≡</span>Объясняем<br/>каждый выбор</div><div><span aria-hidden="true">◇</span>До трёх<br/>вариантов</div></div></div>
  <section id="event-form" className="panel" aria-labelledby="form-title"><div className="section-title"><h2 id="form-title">Ваше событие</h2></div>
  {!options && !optionsError && <p role="status">Загружаем справочники…</p>}
  {optionsError && <div role="alert" className="error"><p>{optionsError}</p><button onClick={() => setReload(r => r + 1)}>Повторить загрузку</button></div>}
  {options && <form onSubmit={submit}>{replacingId && <div className="replacement-note" role="status"><p>Подбираем замену для «{estimate.find(item => item.contractor.id === replacingId)?.contractor.name}». Старая позиция останется до выбора новой.</p><button type="button" onClick={() => { setReplacingId(undefined); setEstimateNotice('Замена отменена. Смета сохранена.'); }}>Отменить замену</button></div>}<div className="fields">
   <label htmlFor="city">Город<select ref={firstField} id="city" required value={form.city} onChange={e => update('city', e.target.value)}>{options.cities.map(v => <option key={v}>{v}</option>)}</select></label>
   <label htmlFor="date">Дата<input id="date" type="date" required min={options.date_min} max={options.date_max} value={form.date} onChange={e => update('date', e.target.value)}/></label>
   <label htmlFor="format">Формат<select id="format" required value={form.event_format} onChange={e => update('event_format', e.target.value)}>{options.event_formats.map(v => <option key={v}>{v}</option>)}</select></label>
   <label htmlFor="category">Категория<select id="category" required value={form.category} onChange={e => update('category', e.target.value)}>{options.categories.map(v => <option key={v}>{v}</option>)}</select></label>
   <label className="wide" htmlFor="budget">Бюджет на одного подрядчика, ₸<input id="budget" type="number" inputMode="numeric" required min="1" step="1" value={form.budget_kzt} onChange={e => update('budget_kzt', e.target.value)}/><small>За мероприятие. Цена в карточке указана «от».</small></label>
   <label htmlFor="language">Язык <small>необязательно</small><select id="language" value={form.language} onChange={e => update('language', e.target.value)}><option value="">Без ограничения</option>{options.languages.map(v => <option key={v}>{v}</option>)}</select></label>
   <label htmlFor="hours">Часы <small>необязательно</small><input id="hours" type="number" min="0.01" step="any" placeholder="Без ограничения" value={form.duration_hours} onChange={e => update('duration_hours', e.target.value)}/></label>
  </div><p className="hint">Календарь: 23 сентября — 31 декабря 2026. Наличие даты в календаре не подтверждает бронирование.</p><button className="primary" type="submit">{loading ? 'Подбираем… Повторить запрос' : 'Подобрать подрядчиков'}<span aria-hidden="true">↗</span></button><div className="search-feedback" role="status" aria-atomic="true">{loading ? 'Проверяем условия. Ожидание — до 12 секунд…' : error ? 'Не удалось выполнить подбор.' : result ? (result.returned_count ? `Подбор готов: ${result.returned_count} варианта.` : 'Подбор завершён: совпадений нет.') : ''}</div>{(result || error) && <button className="outcome-link" type="button" onClick={() => { outcome.current?.focus({ preventScroll: true }); outcome.current?.scrollIntoView({ block: 'start' }); }}>{error ? 'Перейти к ошибке' : 'Посмотреть результат'} ↓</button>}</form>}
  <div className="examples"><p>Попробуйте готовый пример</p><div>{examples.map(e => <button key={e.title} disabled={!options} onClick={() => example(e.request)}>{e.title}</button>)}</div><small>Пример заполняет форму. Нажмите кнопку подбора.</small></div></section></div></div>
  <div className="content"><section hidden={!compact && !loading && !error} className="results" aria-labelledby="results-title" aria-busy={loading}><div className="section-title"><span className="step" aria-hidden="true">✳</span><h2 id="results-title" ref={outcome} tabIndex={-1}>Ваш подбор<span className="title-dot">.</span></h2>{compact && result && <span className="result-total">Показано: {result.returned_count}</span>}</div>
  <div>{loading && <p className="status">Проверяем условия. Ожидание — до 12 секунд…</p>}{result && <ResultSummary result={result} date={form.date}/>}</div>
  {error && <div className="error" role="alert">{error}<p>Параметры сохранены. Повторите подбор.</p></div>}
  {!result && !loading && !error && <div className="empty"><p className="eyebrow">ЛЮДИ / ИДЕИ / СОБЫТИЯ</p><span className="empty-icon" aria-hidden="true">✳</span><h3>У каждого выбора — основания</h3><p>Здесь появятся кандидаты, цены<br/> и факты, на которых основан подбор.</p><div className="pills"><span>До 3 вариантов</span><span>Прозрачные условия</span></div></div>}
  {Boolean(result?.cards.length) && <p className="explanation-note">Соответствие условиям проверяет программный код. AI может выбрать цитату для объяснения; local — объяснение без AI.</p>}
  {result?.cards.map((card, index) => <ContractorCard key={card.id} card={card} index={index} selected={estimate.some(item => item.contractor.id === card.id && item.request.city === resultRequest?.city && item.request.date === resultRequest?.date && item.request.event_format === resultRequest?.event_format)} selectingReplacement={Boolean(replacingId)} onSelect={() => choose(card)}/>)}
  {result && <><details className="filters"><summary>Как условия повлияли на подбор</summary><p>В городе и категории: {result.total_in_category}. Последовательные фильтры: каждый исключённый кандидат учитывается только по первой причине.</p><ul>{result.rejections.map(r => <li key={r.code}>{reasons[r.code]} <strong>{r.count}</strong></li>)}</ul></details>{result.returned_count === 0 && <button onClick={editConditions}>Изменить условия ↑</button>}</>}
  </section>
  <div ref={estimateSection} tabIndex={-1} className="estimate-anchor">
   {estimateNotice && <p className="estimate-feedback" role="status">{estimateNotice}</p>}
   {pendingSelection && <div className="estimate-conflict" role="alert"><p>Город, дата или формат отличаются от текущей сметы. Начать новую смету с «{pendingSelection.card.name}»? Текущие позиции будут удалены.</p><button type="button" onClick={startNewEstimate}>Начать новую смету</button><button type="button" onClick={() => { setPendingSelection(undefined); setEstimateNotice('Текущая смета сохранена.'); }}>Сохранить текущую</button></div>}
   {!storageAvailable && <p role="status">Браузер не разрешил сохранение. Смета доступна до закрытия или обновления страницы; скачайте её, чтобы сохранить.</p>}
   <EstimatePanel items={estimate} onRemove={removeFromEstimate} onReplace={replaceFromEstimate} onClear={() => { setEstimate([]); setReplacingId(undefined); setPendingSelection(undefined); setEstimateNotice('Смета очищена.'); }}/>
  </div><footer>Источник: учебный каталог организатора{options ? ` · ${options.dataset_count} профилей` : ''}. {demo && 'Здесь показаны только отдельные вымышленные фикстуры.'} Подбор не является бронированием.</footer></div></main>
 </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
