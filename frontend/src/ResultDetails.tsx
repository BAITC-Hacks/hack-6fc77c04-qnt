import type { Card, Match } from './types';
import './result-details.css';

export const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const labels: Record<string, string> = {
 price_from_kzt: 'Начальная стоимость', event_formats: 'Формат мероприятия',
 busy_dates: 'Проверка даты', ranking: 'Порядок в подборе', languages: 'Язык по запросу',
 max_hours: 'Продолжительность работы', description: 'Из описания подрядчика',
};
export function evidenceValue(field: string, value: string): string {
 if (field === 'price_from_kzt' && Number.isFinite(Number(value))) return `от ${money(Number(value))} ₸`;
 if (field === 'max_hours') return value === 'неприменимо' ? 'Не ограничена часами присутствия' : `${money(Number(value))} ч`;
 if (field === 'busy_dates') return value.replace(/^(\d{4})-(\d{2})-(\d{2}) отсутствует в списке занятых дат$/, '$3.$2.$1 — нет отметки о занятости');
 return value;
}

export function ResultSummary({ result, date }: { result: Match; date: string }) {
 const displayDate = date.split('-').reverse().join('.');
 const title = result.status === 'matches_found' ? 'ПОДБОР ГОТОВ' : result.status === 'category_missing' ? 'КАТЕГОРИИ НЕТ В ЭТОМ ГОРОДЕ' : 'НЕТ СОВПАДЕНИЙ ПО УСЛОВИЯМ';
 const information = <>
  <dl className="result-counts">
   <div><dt>В городе и категории</dt><dd>{result.total_in_category}</dd></div>
   <div><dt>Подходят по условиям</dt><dd>{result.eligible_count}</dd></div>
   <div><dt>Показано</dt><dd>{result.returned_count}</dd></div>
  </dl>
  {result.status === 'category_missing' ? <p>Выберите другой город или категорию — в этом разделе каталога пока нет профилей.</p> : <>
   {result.eligible_count < 3 && <p>{result.eligible_count > 0 ? 'Показаны все подходящие варианты.' : 'Ни один профиль не прошёл все условия.'} {result.rejections.some(r => r.count > 0) ? 'Причины отсева — под результатами; можно изменить условия и повторить подбор.' : 'В каталоге мало профилей этой категории.'}</p>}
   <p className="calendar-note">На {displayDate} исключено по занятости: {result.rejections.find(r => r.code === 'busy')?.count ?? 0}. Проверено по учебному календарю. Доступность и бронь нужно подтвердить у подрядчика.</p>
  </>}
 </>;
 return <><div className="summary result-summary desktop-summary">
  <p className="eyebrow">{title}</p>{information}
 </div>
 <details className="mobile-summary" open={result.eligible_count < 3}>
  <summary>{result.returned_count > 0 ? `Подбор готов · ${result.returned_count} ${result.returned_count === 1 ? 'вариант' : result.returned_count === 2 ? 'варианта' : 'варианта'}` : title}</summary>
  <div className="mobile-summary-body">{information}<p>Соответствие условиям проверяет программный код. AI может выбрать цитату для объяснения; local — объяснение без AI.</p></div>
 </details></>;
}

export function ContractorCard({ card, index = 0, selected = false, selectingReplacement = false, onSelect }: { card: Card; index?: number; selected?: boolean; selectingReplacement?: boolean; onSelect?: () => void }) {
 const marker = ' В описании: ';
 const split = card.explanation.indexOf(marker);
 const quote = card.evidence.find(e => e.field === 'description')?.value;
 // Old or independently supplied contract responses remain readable as-is.
 const separateQuote = split >= 0 && Boolean(quote);
 const facts = card.evidence.filter(e => !(separateQuote && e.field === 'description'));
 return <article className={`card compact-card${index === 0 ? ' first-candidate' : ''}`}>
  <div className="card-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}<span> / ПОДБОР</span></div><div className="card-body">
  <div className="card-top"><div><div className="candidate-meta"><p className="meta">{card.category} · {card.city}</p>{index === 0 && <span className="first-candidate-label">Первый в подборе</span>}</div><h3>{card.name}</h3></div><strong className="price">от {money(card.price_from_kzt)} ₸</strong></div>
  <section className="choice-reason" aria-label="Почему подходит">
   <div className={`reason-conclusion ${card.explanation_mode}`}>
    <div className="reason-heading"><h4 className={`explanation-badge ${card.explanation_mode}`}>{card.explanation_mode === 'ai' ? 'AI выбрал факт' : 'Без AI · факт из каталога'}</h4><span>Почему подходит</span></div>
    <p className="reason-text">{separateQuote ? card.explanation.slice(0, split) : card.explanation}</p>
   </div>
   {separateQuote && <div className="source-proof"><p className="source-label">Из описания подрядчика</p><blockquote><p>«{quote}»</p></blockquote></div>}
  </section>
  <div className="pills">{card.flags.synthetic && <span>Синтетический профиль</span>}{card.flags.city_imputed && <span>Город дополнен в каталоге</span>}{card.flags.price_imputed && <span>Цена дополнена в каталоге</span>}</div>
  <details className="verified-facts" open><summary>Проверенные условия и факты</summary><dl className="evidence-list">
   {!facts.some(e => e.field === 'languages') && <div><dt>Языки работы</dt><dd>{card.languages.join(', ') || 'Не указаны'}</dd></div>}
   {!facts.some(e => e.field === 'max_hours') && <div><dt>Продолжительность работы</dt><dd>{card.max_hours === null ? 'Не ограничена часами присутствия' : `${money(card.max_hours)} ч`}</dd></div>}
   {facts.map((e, i) => <div className={e.field === 'ranking' || e.field === 'description' ? 'wide-fact' : undefined} key={i}><dt>{labels[e.field] ?? 'Дополнительный факт'}</dt><dd>{evidenceValue(e.field, e.value)}</dd></div>)}
  </dl></details>
  {onSelect && <div className="card-actions"><button type="button" className="select-contractor" disabled={selected} onClick={onSelect} aria-label={selected ? `${card.name} уже в смете` : selectingReplacement ? `Заменить на ${card.name}` : `Добавить ${card.name} в смету`}>{selected ? 'В смете ✓' : selectingReplacement ? 'Выбрать на замену' : 'Выбрать в смету'}</button></div>}
 </div></article>;
}
