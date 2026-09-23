import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { estimateTotal, type EstimateItem } from './estimate';

export type EstimatePdfFonts = { regular: Uint8Array; bold: Uint8Array };
const PAGE = { width: 595.28, height: 841.89, margin: 42, bottom: 68 };
const WIDTH = PAGE.width - PAGE.margin * 2;
const color = {
 paper: rgb(0.974, 0.960, 0.935), ink: rgb(0.145, 0.130, 0.115), muted: rgb(0.40, 0.37, 0.33),
 accent: rgb(0.60, 0.29, 0.14), line: rgb(0.86, 0.82, 0.76), white: rgb(1, 1, 1), pale: rgb(0.94, 0.90, 0.84),
};
const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ')} ₸`;
const date = (value: string) => value.split('-').reverse().join('.');
const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
let loadedFonts: Promise<EstimatePdfFonts> | undefined;

async function fontBytes(): Promise<EstimatePdfFonts> {
 if (!loadedFonts) loadedFonts = Promise.all(['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf'].map(async name => {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`);
  if (!response.ok) throw new Error('Не удалось загрузить шрифт для PDF. Повторите скачивание.');
  return new Uint8Array(await response.arrayBuffer());
 })).then(([regular, bold]) => ({ regular, bold })).catch(error => { loadedFonts = undefined; throw error; });
 return loadedFonts;
}

// Measure real glyph widths, including long words, so catalog names cannot escape their column.
export function wrapPdfText(value: string, font: Pick<PDFFont, 'widthOfTextAtSize'>, size: number, width: number): string[] {
 const result: string[] = [];
 let line = '';
 for (const word of clean(value).split(' ').filter(Boolean)) {
  const joined = line ? `${line} ${word}` : word;
  if (font.widthOfTextAtSize(joined, size) <= width) { line = joined; continue; }
  if (line) { result.push(line); line = ''; }
  for (const character of word) {
   if (line && font.widthOfTextAtSize(line + character, size) > width) { result.push(line); line = ''; }
   line += character;
  }
 }
 if (line) result.push(line);
 return result.length ? result : [''];
}

/** No API request: selected data and bundled Unicode fonts stay in this browser. */
export async function createEstimatePdf(items: EstimateItem[], suppliedFonts?: EstimatePdfFonts): Promise<Uint8Array> {
 const doc = await PDFDocument.create();
 doc.registerFontkit(fontkit);
 const bytes = suppliedFonts ?? await fontBytes();
 const [regular, bold] = await Promise.all([doc.embedFont(bytes.regular, { subset: true }), doc.embedFont(bytes.bold, { subset: true })]);
 doc.setTitle('Firebird - предварительная смета мероприятия');
 doc.setAuthor('QNT - Естай и Бекзат');
 doc.setCreator('QNT Firebird');
 doc.setSubject('Выбранные подрядчики и сумма начальных цен из учебного каталога');
 let page!: PDFPage;
 let y = 0;
 const text = (value: string, x: number, top: number, size = 10, font = regular, ink = color.ink) => {
  page.drawText(clean(value), { x, y: top - size, size, font, color: ink });
 };
 const lines = (rows: string[], x: number, top: number, size: number, leading: number, font = regular, ink = color.ink) => {
  rows.forEach((row, index) => text(row, x, top - index * leading, size, font, ink));
 };
 const newPage = (first = false) => {
  page = doc.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: color.paper });
  page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 45, width: 23, height: 3, color: color.accent });
  text('FIREBIRD', PAGE.margin, PAGE.height - 57, first ? 27 : 21, bold);
  text('QNT / HACKALEM AI', PAGE.width - PAGE.margin - 103, PAGE.height - 63, 8, bold, color.accent);
  y = PAGE.height - (first ? 104 : 101);
  if (!first) { text('Предварительная смета / продолжение', PAGE.margin, y, 10, regular, color.muted); y -= 34; }
 };
 const ensure = (height: number) => { if (y - height < PAGE.bottom) newPage(); };
 newPage(true);
 text('ВАШЕ МЕРОПРИЯТИЕ', PAGE.margin, y, 8, bold, color.accent); y -= 20;
 text('Предварительная смета', PAGE.margin, y, 23, bold); y -= 36;
 text('Выбранные услуги и начальные цены из каталога', PAGE.margin, y, 10, regular, color.muted); y -= 28;
 const event = items[0]?.request;
 if (event) {
  const columns = [{ label: 'ГОРОД', value: event.city }, { label: 'ДАТА', value: date(event.date) }, { label: 'ФОРМАТ', value: event.event_format }];
  const columnWidth = (WIDTH - 40) / 3;
  const context = columns.map(column => ({ ...column, rows: wrapPdfText(column.value, bold, 11, columnWidth - 12) }));
  const height = Math.max(...context.map(column => column.rows.length)) * 16 + 38;
  page.drawRectangle({ x: PAGE.margin, y: y - height, width: WIDTH, height, color: color.pale });
  context.forEach((column, index) => {
   const x = PAGE.margin + 16 + index * columnWidth;
   text(column.label, x, y - 12, 7, bold, color.muted);
   lines(column.rows, x, y - 27, 11, 16, bold);
  });
  y -= height + 25;
 }
 text('ВЫБРАННЫЕ ПОДРЯДЧИКИ', PAGE.margin, y, 8, bold, color.accent); y -= 19;
 if (!items.length) { text('Подрядчики пока не выбраны.', PAGE.margin, y, 12); y -= 39; }
 items.forEach((item, index) => {
  const { contractor: c, request: r } = item;
  const left = PAGE.margin + 38;
  const nameWidth = WIDTH - 208;
  const names = wrapPdfText(c.name, bold, 13, nameWidth);
  const categories = wrapPdfText(c.category, regular, 9, nameWidth);
  const conditions = [r.language && `Язык запроса: ${r.language}`, r.duration_hours !== null && `Длительность запроса: ${r.duration_hours} ч`].filter(Boolean).join(' · ');
  const details = conditions ? wrapPdfText(conditions, regular, 8, WIDTH - 56) : [];
  const labels = [c.flags.synthetic && 'Синтетический профиль', c.flags.price_imputed && 'Цена добавлена при подготовке данных', c.flags.city_imputed && 'Город добавлен при подготовке данных'].filter(Boolean).join(' · ');
  const flags = labels ? wrapPdfText(labels, regular, 7, WIDTH - 56) : [];
  const height = Math.max(names.length * 17 + categories.length * 13, 37) + details.length * 12 + flags.length * 11 + 30;
  ensure(height + 10);
  page.drawRectangle({ x: PAGE.margin, y: y - height, width: WIDTH, height, color: color.white });
  text(String(index + 1).padStart(2, '0'), PAGE.margin + 12, y - 15, 9, bold, color.accent);
  lines(names, left, y - 12, 13, 17, bold);
  lines(categories, left, y - 14 - names.length * 17, 9, 13, regular, color.muted);
  const amount = `от ${money(c.price_from_kzt)}`;
  const priceRight = PAGE.width - PAGE.margin - 15;
  const priceSize = Math.min(12, 149 / bold.widthOfTextAtSize(amount, 1));
  text(amount, priceRight - bold.widthOfTextAtSize(amount, priceSize), y - 14, priceSize, bold);
  const perEvent = 'за мероприятие';
  text(perEvent, priceRight - regular.widthOfTextAtSize(perEvent, 7), y - 32, 7, regular, color.muted);
  let detailsY = y - 18 - Math.max(names.length * 17 + categories.length * 13, 37);
  lines(details, left, detailsY, 8, 12, regular, color.muted);
  detailsY -= details.length * 12 + (flags.length ? 2 : 0);
  lines(flags, left, detailsY, 7, 11, regular, color.accent);
  y -= height + 9;
 });
 const disclaimer = [
  'Это черновик выбранных услуг, а не полная стоимость мероприятия и не бронирование.',
  'Цены «от» взяты из учебного каталога организатора. Итоговую цену, состав услуг и доступность нужно подтвердить у подрядчиков.',
  'Сохранённая смета не обновляет занятость автоматически. Перед решением повторите подбор на нужную дату.',
 ];
 const notes = disclaimer.map(value => wrapPdfText(value, regular, 8, WIDTH - 30));
 const notesHeight = notes.reduce((total, rows) => total + rows.length * 12 + 7, 0) + 27;
 ensure(94 + notesHeight);
 y -= 8;
 page.drawRectangle({ x: PAGE.margin, y: y - 79, width: WIDTH, height: 79, color: color.ink });
 text('СУММА НАЧАЛЬНЫХ ЦЕН', PAGE.margin + 16, y - 12, 8, bold, color.pale);
 text(`от ${money(estimateTotal(items))}`, PAGE.margin + 16, y - 29, 25, bold, color.white);
 const count = `Позиций: ${items.length}`;
 text(count, PAGE.width - PAGE.margin - 16 - regular.widthOfTextAtSize(count, 8), y - 58, 8, regular, color.pale);
 y -= 94;
 text('ПЕРЕД ПОДТВЕРЖДЕНИЕМ', PAGE.margin, y, 7, bold, color.accent); y -= 17;
 notes.forEach(rows => { lines(rows, PAGE.margin, y, 8, 12, regular, color.muted); y -= rows.length * 12 + 7; });
 const pages = doc.getPages();
 pages.forEach((current, index) => {
  page = current;
  current.drawLine({ start: { x: PAGE.margin, y: 49 }, end: { x: PAGE.width - PAGE.margin, y: 49 }, thickness: 0.5, color: color.line });
  text('QNT FIREBIRD · qnt.l33t.kz', PAGE.margin, 37, 7, regular, color.muted);
  const label = `${index + 1} / ${pages.length}`;
  text(label, PAGE.width - PAGE.margin - regular.widthOfTextAtSize(label, 8), 37, 8, regular, color.muted);
 });
 return doc.save();
}

export async function downloadEstimatePdf(items: EstimateItem[]): Promise<void> {
 const bytes = await createEstimatePdf(items);
 const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
 const link = document.createElement('a');
 link.href = url;
 link.download = `firebird-estimate-${items[0]?.request.date ?? 'draft'}.pdf`;
 link.click();
 setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
