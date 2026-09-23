import { describe, expect, it } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createEstimatePdf, wrapPdfText } from './estimatePdf';

const fonts = {
 regular: new Uint8Array(readFileSync(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url))),
 bold: new Uint8Array(readFileSync(new URL('../public/fonts/NotoSans-Bold.ttf', import.meta.url))),
};
const base = {
 contractor: { id: 'host', name: 'Куррапика', category: 'Ведущий', city: 'Алматы', price_from_kzt: 500000, flags: { synthetic: false, price_imputed: false, city_imputed: false } },
 request: { city: 'Алматы', date: '2026-10-10', event_format: 'корпоратив', category: 'Ведущий', budget_kzt: 1000000, language: 'русский', duration_hours: 4 },
};

// Decode the generated document's embedded Unicode maps and text operators.
// This checks the actual PDF text layer, rather than a second display-text builder.
function pageText(doc, page) {
 const fonts = page.node.Resources().lookup(PDFName.of('Font'), PDFDict);
 const maps = new Map(fonts.entries().map(([name, ref]) => {
  const font = doc.context.lookup(ref, PDFDict);
  const cmap = Buffer.from(decodePDFRawStream(font.lookup(PDFName.of('ToUnicode'), PDFRawStream)).decode()).toString();
  const chars = cmap.split('beginbfchar')[1].split('endbfchar')[0];
  const mapping = new Map([...chars.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)].map(([, id, value]) => [id.toUpperCase(), String.fromCharCode(...value.match(/.{4}/g).map(hex => parseInt(hex, 16)))]));
  return [name.toString().slice(1), mapping];
 }));
 const array = page.node.Contents();
 const streams = array instanceof PDFArray ? array.asArray().map(ref => doc.context.lookup(ref, PDFRawStream)) : [array];
 const content = streams.map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString()).join('\n');
 return [...content.matchAll(/BT([\s\S]*?)ET/g)].map(([, block]) => {
  const name = block.match(/\/(\S+)\s+[\d.]+\s+Tf/)[1];
  const encoded = block.match(/<([\da-f]*)>\s*Tj/i)[1];
  return (encoded.match(/.{4}/g) ?? []).map(id => maps.get(name).get(id.toUpperCase()) ?? '�').join('');
 }).join('\n');
}

function qaFile(name, bytes) {
 if (!process.env.FIREBIRD_PDF_QA_DIR) return;
 mkdirSync(process.env.FIREBIRD_PDF_QA_DIR, { recursive: true });
 writeFileSync(`${process.env.FIREBIRD_PDF_QA_DIR}/${name}`, bytes);
}

describe('PDF estimate export', () => {
 it('creates one readable A4 page with event details, source flags and the sum of per-event prices', async () => {
  const items = [base,
   { ...base, contractor: { ...base.contractor, id: 'photo', name: 'Әдемі Әлем · Қазақша', category: 'Фотограф', price_from_kzt: 300000, flags: { synthetic: true, city_imputed: true, price_imputed: true } }, request: { ...base.request, category: 'Фотограф', language: 'қазақша', duration_hours: 3 } },
   { ...base, contractor: { ...base.contractor, id: 'flower', name: 'Сад цветов', category: 'Флорист', price_from_kzt: 150000 }, request: { ...base.request, category: 'Флорист', language: null, duration_hours: null } },
  ];
  const bytes = await createEstimatePdf(items, fonts);
  const pdf = await PDFDocument.load(bytes);
  expect(Buffer.from(bytes).toString('ascii', 0, 8)).toBe('%PDF-1.7');
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89);
  const text = pageText(pdf, pdf.getPage(0));
  for (const expected of ['Алматы', '10.10.2026', 'корпоратив', 'Куррапика', 'Әдемі Әлем · Қазақша', 'Сад цветов', 'Синтетический профиль', 'Цена добавлена', 'Город добавлен', 'от 950 000 ₸', 'Позиций: 3', 'не бронирование', 'не обновляет занятость автоматически', '1 / 1']) expect(text).toContain(expected);
  expect(text).not.toContain('�');
  expect(text).not.toContain('от 3 050 000');
  expect(text).not.toContain('null');
  qaFile('firebird-estimate-sample.pdf', bytes);
 });
 it('wraps long words without losing characters or exceeding their available width', async () => {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fonts.bold, { subset: true });
  const name = 'Ө'.repeat(240);
  const rows = wrapPdfText(name, font, 13, 130);
  expect(rows.length).toBeGreaterThan(10);
  expect(rows.join('')).toBe(name);
  rows.forEach(row => expect(font.widthOfTextAtSize(row, 13)).toBeLessThanOrEqual(130));
 });
 it('paginates 200 long-name items and preserves every item, total, notices and page numbers', async () => {
  const items = Array.from({ length: 200 }, (_, index) => ({ ...base, contractor: { ...base.contractor, id: String(index), name: `Подрядчик ${String(index).padStart(3, '0')} ${'Длинное название '.repeat(13)}`, price_from_kzt: 1000 + index } }));
  const bytes = await createEstimatePdf(items, fonts);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(20);
  expect(pdf.getPageCount()).toBeLessThan(100);
  const pages = pdf.getPages().map(page => pageText(pdf, page));
  const all = pages.join('\n');
  items.forEach((_, index) => expect(all).toContain(`Подрядчик ${String(index).padStart(3, '0')}`));
  pages.forEach((text, index) => expect(text).toContain(`${index + 1} / ${pages.length}`));
  expect(all).toContain('от 219 900 ₸');
  expect(all).toContain('Позиций: 200');
  expect(all).toContain('не бронирование');
  expect(all).not.toContain('�');
  qaFile('firebird-estimate-stress.pdf', bytes);
 }, 20000);
 it('can render an empty draft safely without invented services', async () => {
  const pdf = await PDFDocument.load(await createEstimatePdf([], fonts));
  const text = pageText(pdf, pdf.getPage(0));
  expect(text).toContain('Подрядчики пока не выбраны.');
  expect(text).toContain('от 0 ₸');
  expect(text).toContain('Позиций: 0');
 });
});
