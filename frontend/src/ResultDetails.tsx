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
 return <div className="summary result-summary">
  <p className="eyebrow">{result.status === 'matches_found' ? 'ПОДБОР ГОТОВ' : result.status === 'category_missing' ? 'КАТЕГОРИИ НЕТ В ЭТОМ ГОРОДЕ' : 'НЕТ СОВПАДЕНИЙ ПО УСЛОВИЯМ'}</p>
  <dl className="result-counts">
   <div><dt>В городе и категории</dt><dd>{result.total_in_category}</dd></div>
   <div><dt>Подходят по условиям</dt><dd>{result.eligible_count}</dd></div>
   <div><dt>Показано</dt><dd>{result.returned_count}</dd></div>
  </dl>
  {result.status === 'category_missing' ? <p>Выберите другой город или категорию — в этом разделе каталога пока нет профилей.</p> : <>
   {result.eligible_count < 3 && <p>{result.eligible_count > 0 ? 'Показаны все подходящие варианты.' : 'Ни один профиль не прошёл все условия.'} {result.rejections.some(r => r.count > 0) ? 'Причины отсева — под результатами; можно изменить условия и повторить подбор.' : 'В каталоге мало профилей этой категории.'}</p>}
   <p className="calendar-note">Дата: {displayDate} · проверена по учебному календарю.<br/>Доступность и бронь нужно подтвердить у подрядчика.</p>
  </>}
 </div>;
}

export function ContractorCard({ card, index = 0 }: { card: Card; index?: number }) {
 const marker = ' В описании: ';
 const split = card.explanation.indexOf(marker);
 const quote = card.evidence.find(e => e.field === 'description')?.value;
 // Old or independently supplied contract responses remain readable as-is.
 const separateQuote = split >= 0 && Boolean(quote);
 const facts = card.evidence.filter(e => !(separateQuote && e.field === 'description'));
 return <article className="card">
  <div className="card-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}<span> / ПОДБОР</span></div><div className="card-body">
  <div className="card-top"><div><p className="meta">{card.category} · {card.city}</p><h3>{card.name}</h3></div><strong className="price">от {money(card.price_from_kzt)} ₸</strong></div>
  <section className="choice-reason" aria-label="Почему подходит">
   <div className="reason-heading"><h4>Почему подходит</h4><span className={`explanation-badge ${card.explanation_mode}`}>{card.explanation_mode === 'ai' ? 'AI выбрал факт' : 'Без AI · по данным каталога'}</span></div>
   <p>{separateQuote ? card.explanation.slice(0, split) : card.explanation}</p>
   {separateQuote && <blockquote><p>«{quote}»</p><cite>Из описания подрядчика</cite></blockquote>}
  </section>
  <div className="pills">{card.flags.synthetic && <span>Синтетический профиль</span>}{card.flags.city_imputed && <span>Город дополнен в каталоге</span>}{card.flags.price_imputed && <span>Цена дополнена в каталоге</span>}</div>
  <details><summary>Проверенные условия и факты</summary><dl className="evidence-list">
   {!facts.some(e => e.field === 'languages') && <div><dt>Языки работы</dt><dd>{card.languages.join(', ') || 'Не указаны'}</dd></div>}
   {!facts.some(e => e.field === 'max_hours') && <div><dt>Продолжительность работы</dt><dd>{card.max_hours === null ? 'Не ограничена часами присутствия' : `${money(card.max_hours)} ч`}</dd></div>}
   {facts.map((e, i) => <div key={i}><dt>{labels[e.field] ?? 'Дополнительный факт'}</dt><dd>{evidenceValue(e.field, e.value)}</dd></div>)}
  </dl></details>
 </div></article>;
}
