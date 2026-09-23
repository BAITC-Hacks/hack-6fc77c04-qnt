import type { Card, Request } from './types';

export type EstimateItem = {
 contractor: Pick<Card, 'id' | 'name' | 'category' | 'city' | 'price_from_kzt' | 'flags'>;
 request: Request;
};
export type EstimateChange = {
 status: 'added' | 'replaced' | 'duplicate' | 'incompatible' | 'category_mismatch' | 'missing';
 items: EstimateItem[];
};
type EstimateStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const ESTIMATE_STORAGE_KEY = 'qnt-firebird-estimate-v1';

export function sameEvent(a: Request, b: Request): boolean {
 return a.city === b.city && a.date === b.date && a.event_format === b.event_format;
}

function snapshot(card: Card, request: Request): EstimateItem {
 const { id, name, category, city, price_from_kzt, flags } = card;
 return { contractor: { id, name, category, city, price_from_kzt, flags: { ...flags } }, request: { ...request } };
}

export function addEstimateItem(items: EstimateItem[], card: Card, request: Request): EstimateChange {
 if (items.length && !sameEvent(items[0].request, request)) return { status: 'incompatible', items };
 if (items.some(item => item.contractor.id === card.id)) return { status: 'duplicate', items };
 return { status: 'added', items: [...items, snapshot(card, request)] };
}

// Keep the original choice until a replacement passes every check.
export function replaceEstimateItem(items: EstimateItem[], replacedId: string, card: Card, request: Request): EstimateChange {
 const index = items.findIndex(item => item.contractor.id === replacedId);
 if (index < 0) return { status: 'missing', items };
 if (!sameEvent(items[index].request, request)) return { status: 'incompatible', items };
 if (items[index].contractor.category !== card.category || request.category !== card.category) return { status: 'category_mismatch', items };
 if (items.some((item, i) => i !== index && item.contractor.id === card.id)) return { status: 'duplicate', items };
 return { status: 'replaced', items: items.map((item, i) => i === index ? snapshot(card, request) : item) };
}

export function removeEstimateItem(items: EstimateItem[], id: string): EstimateItem[] {
 return items.filter(item => item.contractor.id !== id);
}

export function estimateTotal(items: EstimateItem[]): number {
 return items.reduce((total, item) => total + item.contractor.price_from_kzt, 0);
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 80): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function validItem(value: unknown): value is EstimateItem {
 if (!record(value) || !record(value.contractor) || !record(value.request)) return false;
 const c = value.contractor, r = value.request;
 return text(c.id, 120) && text(c.name, 240) && text(c.category) && text(c.city) && amount(c.price_from_kzt)
  && record(c.flags) && ['synthetic', 'city_imputed', 'price_imputed'].every(key => typeof c.flags === 'object' && c.flags !== null && typeof (c.flags as Record<string, unknown>)[key] === 'boolean')
  && text(r.city) && date(r.date) && text(r.event_format) && text(r.category) && amount(r.budget_kzt) && r.budget_kzt > 0
  && (r.language === null || text(r.language))
  && (r.duration_hours === null || (typeof r.duration_hours === 'number' && Number.isFinite(r.duration_hours) && r.duration_hours > 0))
  && c.city === r.city && c.category === r.category;
}

function validItems(value: unknown): value is EstimateItem[] {
 if (!Array.isArray(value) || value.length > 200 || !value.every(validItem)) return false;
 const items = value as EstimateItem[];
 return new Set(items.map(item => item.contractor.id)).size === items.length
  && items.every(item => sameEvent(items[0].request, item.request))
  && Number.isSafeInteger(estimateTotal(items));
}

function defaultStorage(): EstimateStorage | undefined {
 return typeof window === 'undefined' ? undefined : window.localStorage;
}

export function readEstimate(storage?: EstimateStorage): EstimateItem[] {
 try {
  const raw = (storage ?? defaultStorage())?.getItem(ESTIMATE_STORAGE_KEY);
  if (!raw || raw.length > 500_000) return [];
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1 || !validItems(value.items)) return [];
  // Read only our schema; unknown persisted fields never become application state.
  return value.items.map(item => ({ contractor: { id: item.contractor.id, name: item.contractor.name, category: item.contractor.category, city: item.contractor.city, price_from_kzt: item.contractor.price_from_kzt, flags: { synthetic: item.contractor.flags.synthetic, city_imputed: item.contractor.flags.city_imputed, price_imputed: item.contractor.flags.price_imputed } }, request: { city: item.request.city, date: item.request.date, event_format: item.request.event_format, category: item.request.category, budget_kzt: item.request.budget_kzt, language: item.request.language, duration_hours: item.request.duration_hours } }));
 } catch { return []; }
}

export function saveEstimate(items: EstimateItem[], storage?: EstimateStorage): boolean {
 try {
  const target = storage ?? defaultStorage();
  if (!target || !validItems(items)) return false;
  target.setItem(ESTIMATE_STORAGE_KEY, JSON.stringify({ version: 1, items }));
  return true;
 } catch { return false; }
}
