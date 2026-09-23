import type { Match, Reason } from './types';
import './results-footer.css';

const labels: Record<Reason, string> = {
 busy: 'Заняты в эту дату',
 format: 'Не работают с этим форматом',
 budget: 'Цена выше бюджета',
 language: 'Не указан нужный язык',
 duration: 'Недостаточно часов работы',
};

/** Keep this as the last direct child of the results section: that section bounds sticky positioning. */
export function ResultsFooter({ result }: { result: Match }) {
 const excluded = result.total_in_category - result.eligible_count;
 return <div className="results-footer">
  <details className="results-filter-details">
   <summary><span>Как условия повлияли на подбор</span><span className="results-filter-count">Исключено: {excluded}</span></summary>
   <div className="results-filter-content">
    <p className="results-filter-overview">В городе и категории: <strong>{result.total_in_category}</strong>. Подходят всем условиям: <strong>{result.eligible_count}</strong>.</p>
    {result.rejections.length > 0 && <ul>{result.rejections.map(reason => <li key={reason.code} className={reason.count === 0 ? 'no-exclusions' : undefined}><span>{labels[reason.code]}</span><strong>{reason.count}</strong></li>)}</ul>}
    <p className="results-filter-note">Каждый исключённый профиль учтён один раз — по первой причине, по которой не прошёл проверку.</p>
    <p className="results-filter-note">Условия и порядок проверяет программа. AI выбирает подтверждающую цитату; короткий вывод составляется из проверенного факта. Без AI доступны те же условия подбора и объяснения по каталогу.</p>
   </div>
  </details>
 </div>;
}
