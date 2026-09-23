// Run against the real local backend serving a production build.
// Playwright is an optional external QA tool, not an application dependency.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const base = process.env.QA_ORIGIN || 'http://127.0.0.1:8001';
const screenshots = join(__dirname, 'screenshots');
mkdirSync(screenshots, { recursive: true });
(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const submit = () => page.locator('button[type=submit]').click();
  async function search() {
   const response = page.waitForResponse(r => r.url().endsWith('/api/match'));
   await submit();
   const data = await (await response).json();
   await page.locator('.summary').waitFor();
   assert.equal(await page.locator('.card').count(), data.returned_count);
   assert.deepEqual(await page.locator('.card h3').allTextContents(), data.cards.map(c => c.name));
   return data;
  }
  async function fits() {
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
  }
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
   await page.setViewportSize({ width, height: 900 });
   await page.goto(base);
   await page.locator('#city option').first().waitFor({ state: 'attached' });
   assert.equal(await page.locator('.demo').count(), 0);
   const data = await search();
   assert.equal(data.returned_count, 3);
   assert(data.cards.every(c => c.explanation_mode === 'local'));
   await page.locator('.outcome-link').focus();
   await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(() => document.activeElement.id), 'results-title');
   const facts = page.locator('.card summary').first();
   await facts.focus(); await page.keyboard.press('Enter');
   assert(await page.locator('.card details').first().getAttribute('open') !== null);
   assert((await facts.boundingBox()).height >= 44);
   assert(!(await page.locator('.card dt').allTextContents()).includes('price_from_kzt'));
   const values = await page.locator('.card').first().locator('dd').allTextContents();
   for (const fact of data.cards[0].evidence) assert(values.includes(fact.value));
   await fits();
   assert(await page.locator('input,select').evaluateAll(els => els.every(e => e.labels.length && getComputedStyle(e).fontSize === '16px')));
   if (width === 1440 || width === 390) {
    await page.locator('.card summary').first().click();
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: join(screenshots, `editorial-${width}.png`), fullPage: true });
   }
   await page.locator('#budget').fill('1000');
   const empty = await search();
   assert.equal(empty.status, 'no_matches'); await fits();
   console.log(`PASS ${width}px: real matches, evidence, keyboard, empty, no overflow`);
  }
  await page.getByRole('button', { name: 'Нет категории', exact: true }).click();
  assert.equal((await search()).status, 'category_missing');
  await page.getByRole('button', { name: 'Редкие флористы', exact: true }).click();
  const short = await search(); assert(short.returned_count > 0 && short.returned_count < 3);
  await page.getByRole('button', { name: 'Ведущие осенью', exact: true }).click();
  await page.route('**/api/match', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Проверка ошибки API' } }) }));
  await submit(); await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.card').count(), 0);
  assert.equal(await page.locator('#budget').inputValue(), '1000000');
  await page.unroute('**/api/match');
  const original = await search();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  await page.route('**/api/match', async route => { entered(); await gate; await route.fulfill({ json: original }).catch(() => {}); });
  await submit(); await started;
  assert((await page.locator('.search-feedback').textContent()).includes('12 секунд'));
  await page.locator('#budget').fill('1000');
  release(); await page.unrouteAll({ behavior: 'wait' });
  assert.equal(await page.locator('.card').count(), 0);
  assert.equal((await search()).status, 'no_matches');
  console.log('PASS real category_missing, short response, injected 503, retry, cancelled stale response');
  const marked = structuredClone(original);
  marked.cards[0].name = 'ДлинноеИмя'.repeat(40);
  marked.cards[0].explanation_mode = 'ai';
  marked.cards[0].flags = { synthetic: true, city_imputed: true, price_imputed: true };
  marked.cards = marked.cards.slice(0, 2); marked.returned_count = 2;
  await page.route('**/api/match', route => route.fulfill({ json: marked }));
  await page.setViewportSize({ width: 320, height: 900 });
  await search(); await fits();
  for (const flag of ['AI · выбор цитаты', 'synthetic', 'city_imputed', 'price_imputed']) assert((await page.locator('.card').first().textContent()).includes(flag));
  assert.deepEqual(errors, []);
  console.log('PASS injected two cards, AI/flags, long text at 320px; no JS errors');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
