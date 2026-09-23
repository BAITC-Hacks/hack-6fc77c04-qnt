import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EstimatePanel } from './EstimatePanel';
import { addEstimateItem, estimateText, estimateTotal, ESTIMATE_STORAGE_KEY, readEstimate, removeEstimateItem, replaceEstimateItem, saveEstimate } from './estimate';
import type { Card, Request } from './types';

const request: Request = { city: 'Алматы', date: '2026-10-10', event_format: 'корпоратив', category: 'Ведущий', budget_kzt: 1000000, language: 'русский', duration_hours: 4 };
const card: Card = { id: 'host', name: 'Первый', category: 'Ведущий', city: 'Алматы', price_from_kzt: 500000, languages: ['русский'], max_hours: 6, explanation: 'Факт.', explanation_mode: 'local', evidence: [], flags: { synthetic: false, city_imputed: false, price_imputed: false } };
const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };

describe('A draft of selected contractors for one event', () => {
 it('sums per-event starting prices once, permits different profiles in the same category, and removes a choice', () => {
  const first = addEstimateItem([], card, request);
  const duplicate = addEstimateItem(first.items, card, request);
  expect(duplicate.status).toBe('duplicate');
  expect(duplicate.items).toBe(first.items);
  const second = addEstimateItem(first.items, { ...card, id: 'host-2', price_from_kzt: 300000 }, request);
  expect(second.status).toBe('added');
  expect(estimateTotal(second.items)).toBe(800000);
  expect(estimateTotal(removeEstimateItem(second.items, 'host'))).toBe(300000);
 });
 it.each([{ city: 'Астана' }, { date: '2026-10-11' }, { event_format: 'свадьба' }])('keeps the existing draft when the event differs: %j', change => {
  const original = addEstimateItem([], card, request).items;
  const result = addEstimateItem(original, { ...card, id: 'other' }, { ...request, ...change });
  expect(result.status).toBe('incompatible');
  expect(result.items).toBe(original);
 });
 it('preserves a snapshot of the original matching conditions for replacement', () => {
  const submitted = { ...request };
  const offered = { ...card, flags: { ...card.flags } };
  const draft = addEstimateItem([], offered, submitted).items;
  submitted.budget_kzt = 1;
  offered.flags.synthetic = true;
  offered.name = 'Изменённое имя';
  expect(draft[0].request).toEqual(request);
  expect(draft[0].contractor.name).toBe(card.name);
  expect(draft[0].contractor.flags.synthetic).toBe(false);
 });
 it('replaces atomically at the same position and records the new search conditions', () => {
  const original = addEstimateItem([], card, request).items;
  const changed = replaceEstimateItem(original, 'host', { ...card, id: 'new', price_from_kzt: 200000 }, { ...request, budget_kzt: 300000, language: null });
  expect(changed.status).toBe('replaced');
  expect(changed.items).toHaveLength(1);
  expect(changed.items[0].contractor.id).toBe('new');
  expect(changed.items[0].request.budget_kzt).toBe(300000);
  expect(original[0].contractor.id).toBe('host');
 });
 it('does not remove an original when replacement conflicts, targets a duplicate, or is missing', () => {
  const original = addEstimateItem(addEstimateItem([], card, request).items, { ...card, id: 'other' }, request).items;
  const attempts = [
   replaceEstimateItem(original, 'host', { ...card, id: 'other' }, request),
   replaceEstimateItem(original, 'host', { ...card, id: 'new' }, { ...request, date: '2026-11-14' }),
   replaceEstimateItem(original, 'host', { ...card, id: 'new', category: 'Фотограф' }, { ...request, category: 'Фотограф' }),
   replaceEstimateItem(original, 'missing', card, request),
  ];
  expect(attempts.map(result => result.status)).toEqual(['duplicate', 'incompatible', 'category_mismatch', 'missing']);
  attempts.forEach(result => expect(result.items).toBe(original));
 });
 it('persists and restores a versioned draft, including source-data flags', () => {
  const storage = memory();
  const items = addEstimateItem([], { ...card, flags: { ...card.flags, synthetic: true, price_imputed: true } }, request).items;
  expect(saveEstimate(items, storage)).toBe(true);
  expect(readEstimate(storage)).toEqual(items);
  expect(saveEstimate([], storage)).toBe(true);
  expect(readEstimate(storage)).toEqual([]);
 });
 it('rejects corrupted, incompatible, duplicate, impossible-date and unsafe-price persisted data', () => {
  const valid = addEstimateItem([], card, request).items[0];
  const invalid = ['{', JSON.stringify({ version: 2, items: [valid] }), ...[
   [valid, valid], [valid, { ...valid, contractor: { ...valid.contractor, id: 'new' }, request: { ...request, date: '2026-10-11' } }],
   [{ ...valid, request: { ...request, date: '2026-02-31' } }],
   [{ ...valid, contractor: { ...valid.contractor, price_from_kzt: -1 } }],
   [{ ...valid, contractor: { ...valid.contractor, price_from_kzt: Number.MAX_SAFE_INTEGER + 1 } }],
   [{ ...valid, contractor: { ...valid.contractor, flags: null } }],
   [{ ...valid, request: { ...request, duration_hours: '4' } }],
   [{ ...valid, request: { ...request, city: 'Астана' } }],
  ].map(items => JSON.stringify({ version: 1, items }))];
  for (const raw of invalid) { const storage = memory(); storage.setItem(ESTIMATE_STORAGE_KEY, raw); expect(readEstimate(storage)).toEqual([]); }
 });
 it('works without storage access and reports failure to save', () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
  expect(readEstimate(storage)).toEqual([]);
  expect(saveEstimate(addEstimateItem([], card, request).items, storage)).toBe(false);
 });
 it('exports the original event, prices, conditions and caveats without adding fees or multiplying hours', () => {
  const items = addEstimateItem([], card, request).items;
  const text = estimateText(items).replaceAll('\u00a0', ' ');
  expect(text).toContain('Алматы · 10.10.2026 · корпоратив');
  expect(text).toContain('Первый — Ведущий');
  expect(text).toContain('От 500 000 ₸ за мероприятие');
  expect(text).toContain('Сумма начальных цен: от 500 000 ₸');
  expect(text).toContain('Язык: русский');
  expect(text).toContain('Длительность: 4 ч');
  expect(text).toContain('не бронирование');
  expect(text).toContain('не обновляет занятость автоматически');
 });
 it('shows initial prices, event context, provenance and no booking claim', () => {
  const items = addEstimateItem([], { ...card, name: '<script>bad</script>', flags: { ...card.flags, synthetic: true, price_imputed: true } }, request).items;
  const html = renderToStaticMarkup(createElement(EstimatePanel, { items, onRemove: () => {}, onReplace: () => {}, onClear: () => {} }));
  expect(html).toContain('10.10.2026');
  expect(html).toContain('Сумма начальных цен');
  expect(html).toContain('Синтетический профиль');
  expect(html).toContain('Цена добавлена при подготовке данных');
  expect(html).toContain('не бронирование');
  expect(html).toContain('пока вы не выберете замену');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
 });
});
