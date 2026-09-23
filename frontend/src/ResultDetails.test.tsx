import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractorCard, ResultSummary, evidenceValue } from './ResultDetails';
import type { Card, Match } from './types';
const card: Card = { id: 'test', name: 'Имя', category: 'Ведущий', city: 'Алматы', price_from_kzt: 500000, languages: ['русский'], max_hours: 6, explanation: 'Формат указан в каталоге. В описании: «Деловые встречи».', explanation_mode: 'ai', evidence: [{ field: 'price_from_kzt', value: '500000' }, { field: 'languages', value: 'русский' }, { field: 'max_hours', value: '6.0' }, { field: 'description', value: 'Деловые встречи' }, { field: 'busy_dates', value: '2026-10-10 отсутствует в списке занятых дат' }], flags: { synthetic: false, city_imputed: false, price_imputed: false } };
describe('Readable evidence presentation', () => {
 it('puts honest AI attribution before the quote, renders it once and translates fields', () => {
  const html = renderToStaticMarkup(<ContractorCard card={card}/>);
  expect(html.indexOf('AI выбрал факт')).toBeLessThan(html.indexOf('Деловые встречи'));
  expect(html.match(/Деловые встречи/g)).toHaveLength(1);
  expect(html.match(/русский/g)).toHaveLength(1);
  expect(html).not.toContain('price_from_kzt');
  expect(html).not.toContain('max_hours');
  expect(html).toContain('6 ч');
  expect(html).toContain('10.10.2026 — нет отметки о занятости');
 });
 it('never labels fallback as AI selection and escapes catalog text', () => {
  const html = renderToStaticMarkup(<ContractorCard card={{ ...card, explanation_mode: 'local', explanation: '<script>alert(1)</script>' }}/>);
  expect(html).toContain('Без AI');
  expect(html).not.toContain('AI выбрал факт');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
 });
 it('preserves a standalone API explanation without the quote marker', () => {
  const html = renderToStaticMarkup(<ContractorCard card={{ ...card, explanation: 'Другое объяснение из API.' }}/>);
  expect(html).toContain('Другое объяснение из API.');
  expect(html).toContain('Деловые встречи');
 });
 it('handles non-hour-based services without claiming a numeric limit', () => {
  expect(evidenceValue('max_hours', 'неприменимо')).toBe('Не ограничена часами присутствия');
 });
 it('shows short-result context, counts and calendar caveat separately', () => {
  const result: Match = { status: 'matches_found', message: 'Legacy long paragraph', total_in_category: 2, eligible_count: 1, returned_count: 1, cards: [card], rejections: [{ code: 'busy', count: 1 }] };
  const html = renderToStaticMarkup(<ResultSummary result={result} date="2026-10-10"/>);
  expect(html).toContain('Показаны все подходящие варианты');
  expect(html).toContain('Причины отсева');
  expect(html).toContain('10.10.2026');
  expect(html).toContain('Доступность и бронь нужно подтвердить');
  expect(html).not.toContain('Legacy long paragraph');
 });
 it.each([0, 1, 2, 3])('keeps the mobile explanation visible when only %i options qualify', count => {
  const result: Match = { status: count ? 'matches_found' : 'no_matches', message: '', total_in_category: 5, eligible_count: count, returned_count: count, cards: [], rejections: [{code:'busy',count:5-count}] };
  const html = renderToStaticMarkup(<ResultSummary result={result} date="2026-10-10"/>);
  expect(html.includes('class="mobile-summary" open=""')).toBe(count < 3);
 });
});
