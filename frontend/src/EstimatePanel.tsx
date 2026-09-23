import { estimateText, estimateTotal } from './estimate';
import type { EstimateItem } from './estimate';
import './estimate.css';

type Props = {
 items: EstimateItem[];
 onRemove: (id: string) => void;
 onReplace: (item: EstimateItem) => void;
 onClear: () => void;
};
const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₸`;
const dateLabel = (value: string) => value.split('-').reverse().join('.');

export function EstimatePanel({ items, onRemove, onReplace, onClear }: Props) {
 const event = items[0]?.request;
 function download() {
  const url = URL.createObjectURL(new Blob([estimateText(items)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `firebird-estimate-${event?.date ?? 'draft'}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
 }
 return <section className="estimate-panel" aria-labelledby="estimate-title">
  <div className="estimate-heading"><div><p className="eyebrow">ВАШИ ВЫБРАННЫЕ ПОДРЯДЧИКИ</p><h2 id="estimate-title">Предварительная смета</h2></div>{items.length > 0 && <div className="estimate-actions"><button type="button" onClick={download}>Скачать смету</button><button type="button" onClick={onClear}>Очистить смету</button></div>}</div>
  {!event ? <p className="estimate-empty">Добавьте подрядчика из подбора, затем выберите следующую категорию. Здесь соберётся стоимость выбранных услуг для одного мероприятия.</p> : <>
   <p className="estimate-context">{event.city} <span aria-hidden="true">·</span> {dateLabel(event.date)} <span aria-hidden="true">·</span> {event.event_format}</p>
   <ul className="estimate-items">{items.map(item => <li key={item.contractor.id}>
    <div className="estimate-person"><span className="estimate-category">{item.contractor.category}</span><h3>{item.contractor.name}</h3>
     {(item.request.language || item.request.duration_hours !== null) && <p className="estimate-conditions">Условия подбора: {[item.request.language, item.request.duration_hours !== null ? `${item.request.duration_hours} ч` : null].filter(Boolean).join(' · ')}</p>}
     {item.contractor.flags.synthetic && <span className="estimate-provenance">Синтетический профиль</span>}
     {item.contractor.flags.price_imputed && <span className="estimate-provenance">Цена добавлена при подготовке данных</span>}
     {item.contractor.flags.city_imputed && <span className="estimate-provenance">Город добавлен при подготовке данных</span>}
    </div>
    <p className="estimate-price">от {money(item.contractor.price_from_kzt)}<span>за мероприятие</span></p>
    <div className="estimate-actions"><button type="button" aria-label={`Заменить подрядчика ${item.contractor.name}`} onClick={() => onReplace(item)}>Заменить</button><button type="button" aria-label={`Убрать подрядчика ${item.contractor.name} из сметы`} onClick={() => onRemove(item.contractor.id)}>Убрать</button></div>
   </li>)}</ul>
   <div className="estimate-total" aria-live="polite"><div><span>Сумма начальных цен</span><small>Выбрано подрядчиков: {items.length}</small></div><strong>от {money(estimateTotal(items))}</strong></div>
   <p className="estimate-help">«Заменить» вернёт условия этого подбора в поиск. Текущий подрядчик останется в смете, пока вы не выберете замену.</p>
  </>}
  <p className="estimate-note">Это черновик выбранных услуг, не полная стоимость мероприятия и не бронирование. Итоговую цену, состав услуг и доступность нужно подтвердить у подрядчиков.{event && ' Сохранённая смета не обновляет занятость автоматически: перед решением повторите подбор на нужную дату.'}</p>
 </section>;
}
