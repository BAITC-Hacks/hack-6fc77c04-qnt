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
  const settle = () => page.evaluate(async () => {
   await Promise.all(document.querySelector('main').getAnimations().map(a => a.finished.catch(() => {})));
   await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  async function openForm() {
   if (await page.locator('.edit-conditions').count()) {
    await page.locator('.edit-conditions').click();
    await page.waitForFunction(() => document.activeElement.id === 'city');
    await settle();
    const settledScroll = await page.evaluate(() => scrollY);
    await settle();
    assert.equal(await page.evaluate(() => scrollY), settledScroll, 'form focus does not cause a second scroll');
   }
  }
  async function submit() { await openForm(); await page.locator('button[type=submit]').click(); }
  async function search() {
   const response = page.waitForResponse(r => r.url().endsWith('/api/match'));
   await submit();
   const data = await (await response).json();
   await page.locator('.summary').waitFor({ state: 'attached' });
   await settle();
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
   assert.equal(await page.locator('.results').isVisible(), false);
   if (width === 1440) await page.screenshot({ path: join(screenshots, 'before-search-1440.png'), fullPage: true });
   assert.equal(await page.locator('.demo').count(), 0);
   const data = await search();
   assert.equal(data.returned_count, 3);
   assert(data.cards.every(c => c.explanation_mode === 'local'));
   await page.waitForFunction(() => document.activeElement.id === 'results-title');
   assert.equal(await page.locator('.hero-content').isVisible(), false);
   assert((await page.locator('.conditions').textContent()).includes('1 000 000'));
   assert((await page.locator('#results-title').boundingBox()).y < 600);
   assert.equal(await page.evaluate(() => scrollY), 0);
   assert.equal(await page.evaluate(() => document.activeElement.id), 'results-title');
   const facts = page.locator('.card summary').first();
   await facts.focus(); await page.keyboard.press('Enter');
   assert(await page.locator('.card details').first().getAttribute('open') !== null);
   assert((await facts.boundingBox()).height >= 44);
   assert(!(await page.locator('.card dt').allTextContents()).includes('price_from_kzt'));
   for (const fact of data.cards[0].evidence) {
    if (['price_from_kzt', 'busy_dates', 'max_hours'].includes(fact.field)) continue; // Formatting covered by ResultDetails tests.
    assert((await page.locator('.card').first().textContent()).includes(fact.value));
   }
   await fits();
   await page.evaluate(() => window.scrollTo(0, 500));
   const stickyHeader = await page.locator('.hero').boundingBox();
   assert(Math.abs(stickyHeader.y) < 1, 'results header remains pinned');
   if (width <= 760) {
    assert(await page.locator('.choice-reason > p').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), 'mobile explanation text');
    assert(await page.locator('.explanation-badge').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 13), 'mode label readable');
    assert(await page.locator('.conditions-glance > span').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 14), 'glance readable');
    assert(stickyHeader.height < 150, 'mobile header leaves room for results');
    assert.equal(await page.locator('.conditions-glance').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'no horizontal condition scrolling');
    if (width <= 390) {
     assert((await page.locator('.card').first().boundingBox()).y < 844, 'first answer appears in initial phone viewport');
    }
    const allConditions = page.locator('.conditions-mobile summary');
    await allConditions.focus(); await page.keyboard.press('Enter');
    assert(await page.locator('.conditions-menu').isVisible());
    assert.equal(await page.locator('.conditions-menu > div').count(), 7);
    assert((await page.locator('.conditions-menu').textContent()).includes('1 000 000'));
    await allConditions.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.conditions-menu').isVisible(), false);
    const information = page.locator('.mobile-summary summary');
    await information.focus(); await page.keyboard.press('Enter');
    assert((await page.locator('.mobile-summary').textContent()).includes('учебному календарю'));
    await information.focus(); await page.keyboard.press('Enter');
   }
   await page.locator('.card summary').last().evaluate(el => el.scrollIntoView({ block: 'start' }));
   assert((await page.locator('.card summary').last().boundingBox()).y >= stickyHeader.height, 'facts not covered by sticky header');
   assert(await page.locator('input,select').evaluateAll(els => els.every(e => e.labels.length && getComputedStyle(e).fontSize === '16px')));
   if (width === 1440 || width === 390) {
    await page.locator('.card summary').first().click();
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.screenshot({ path: join(screenshots, `editorial-${width}.png`), fullPage: true });
   }
   await openForm();
   assert.equal(await page.locator('#budget').inputValue(), '1000000');
   await page.locator('#budget').fill('1000');
   const empty = await search();
   assert.equal(empty.status, 'no_matches'); await fits();
   assert.equal(await page.locator('.hero-content').isVisible(), false);
   console.log(`PASS ${width}px: real matches, evidence, keyboard, empty, no overflow`);
  }
  await openForm();
  await page.getByRole('button', { name: 'Нет категории', exact: true }).click();
  assert.equal((await search()).status, 'category_missing');
  await openForm();
  await page.getByRole('button', { name: 'Редкие флористы', exact: true }).click();
  const short = await search(); assert(short.returned_count > 0 && short.returned_count < 3);
  await openForm();
  await page.getByRole('button', { name: 'Ведущие осенью', exact: true }).click();
  await page.route('**/api/match', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Проверка ошибки API' } }) }));
  await submit(); await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.hero-content').isVisible(), true);
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
  for (const flag of ['AI выбрал факт', 'Синтетический профиль', 'Город дополнен в каталоге', 'Цена дополнена в каталоге']) assert((await page.locator('.card').first().textContent()).includes(flag));
  assert.deepEqual(errors, []);
  console.log('PASS injected two cards, AI/flags, long text at 320px; no JS errors');
  assert.equal(await page.title(), 'QNT — умный подбор подрядчиков');
  assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
  for (const property of ['title', 'description', 'type', 'site_name', 'image']) {
   assert(await page.locator(`meta[property="og:${property}"]`).getAttribute('content'));
  }
  for (const name of ['card', 'title', 'description', 'image']) {
   assert(await page.locator(`meta[name="twitter:${name}"]`).getAttribute('content'));
  }
  assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://qnt.l33t.kz/og-image.png');
  for (const asset of ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/og-image.png']) {
   const response = await page.request.get(base + asset);
   assert(response.ok(), asset);
   assert(!(response.headers()['content-type'] || '').includes('text/html'), asset);
  }
  const dimensions = await page.evaluate(async () => {
   const img = new Image(); img.src = '/og-image.png'; await img.decode();
   return [img.naturalWidth, img.naturalHeight];
  });
  assert.deepEqual(dimensions, [1200, 630]);
  console.log('PASS production metadata, local icon links and 1200x630 OG image (not public chat previews)');
  await page.unrouteAll();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base);
  await search();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'results-title');
  assert.equal(await page.evaluate(() => document.querySelector('main').getAnimations().length), 0);
  await openForm();
  assert.equal(await page.evaluate(() => document.querySelector('main').getAnimations().length), 0);
  console.log('PASS reduced motion: no screen animation, results/form focus retained');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
