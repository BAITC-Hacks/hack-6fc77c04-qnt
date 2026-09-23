import { expect, test, type Page } from "@playwright/test";
import { examples } from "../src/demo";
import { evidenceLabel } from "../src/presentation";
import type { Match } from "../src/types";

test("production HTML and assets served by the real backend", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("requestfailed", (request) => failures.push(request.url()));
  const response = await page.goto("http://127.0.0.1:8000/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle("QNT Match — умный подбор подрядчиков");
  await expect(page.locator(".demo")).toHaveCount(0);
  await expect(page.locator("#city")).toHaveValue("Алматы");
  const result = await search(page);
  expect(result.returned_count).toBe(3);
  for (const path of [
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/og-qnt.png",
  ]) {
    expect((await page.request.get(`http://127.0.0.1:8000${path}`)).ok()).toBe(
      true,
    );
  }
  expect(failures).toEqual([]);
});

test("real backend validation error reaches the UI", async ({ page }) => {
  await ready(page);
  await page.route("**/api/match", (route) =>
    route.continue({
      postData: JSON.stringify({
        ...route.request().postDataJSON(),
        date: "2027-01-01",
      }),
    }),
  );
  const response = page.waitForResponse((r) => r.url().endsWith("/api/match"));
  await page.locator(".primary").click();
  expect((await response).status()).toBe(422);
  await expect(page.getByRole("alert")).toContainText("Проверьте параметры");
  await expect(page.locator("#date")).toHaveValue("2026-10-10");
  await expect(page.locator(".card")).toHaveCount(0);
});

test("12-second UI deadline ends a stalled request without fake success", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/match", () => {});
  const started = Date.now();
  await page.locator(".primary").click();
  await expect(page.getByRole("alert")).toContainText("12 секунд", {
    timeout: 16000,
  });
  expect(Date.now() - started).toBeGreaterThanOrEqual(11500);
  await expect(page.locator(".primary")).toBeEnabled();
  await expect(page.locator(".card")).toHaveCount(0);
});

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("#city")).toHaveValue("Алматы");
  await expect(page.locator(".demo")).toHaveCount(0);
}
async function search(page: Page): Promise<Match> {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/match") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Подобрать подрядчиков" }).click();
  const data = await (await response).json();
  await expect(page.locator(".summary")).toHaveText(
    new RegExp(
      data.status === "matches_found"
        ? "НАЙДЕНО"
        : data.status === "no_matches"
          ? "НЕТ СОВПАДЕНИЙ"
          : "КАТЕГОРИИ НЕТ",
    ),
  );
  return data;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const width of [320, 375, 390, 768, 1440]) {
  test(`real API / ${width}px: layout, labels, results, evidence`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    await noOverflow(page);
    const inputChecks = await page
      .locator("input, select")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          label: (element as HTMLInputElement).labels?.length,
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
          fontSize: parseFloat(getComputedStyle(element).fontSize),
        })),
      );
    expect(
      inputChecks.every(
        (c) => c.label && c.width >= 120 && c.height >= 44 && c.fontSize >= 16,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("button")
        .evaluateAll((elements) =>
          elements.every((e) => e.getBoundingClientRect().height >= 44),
        ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`initial-${width}.png`),
      fullPage: true,
    });
    const data = await search(page);
    expect(data.cards.map((c) => c.id)).toEqual([
      "HK-88430",
      "HK-29829",
      "HK-27222",
    ]);
    expect(data.cards.every((c) => c.explanation_mode === "local")).toBe(true);
    await expect(page.locator(".card h3")).toHaveText(
      data.cards.map((c) => c.name),
    );
    await page.locator(".card summary").first().click();
    const evidenceRows = page.locator(".card").first().locator("dl > div");
    for (let i = 0; i < data.cards[0].evidence.length; i++) {
      await expect(evidenceRows.nth(i + 2).locator("dt")).toHaveText(
        evidenceLabel(data.cards[0].evidence[i].field),
      );
      await expect(evidenceRows.nth(i + 2).locator("dd")).toHaveText(
        data.cards[0].evidence[i].value,
      );
    }
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`results-${width}.png`),
      fullPage: true,
    });
  });
}

test("real API: all outcomes, short results, date change and repeated request", async ({
  page,
}) => {
  await ready(page);
  const original = await search(page);
  await page.locator("#date").fill("2026-10-11");
  const changed = await search(page);
  expect(changed.cards.map((c) => c.id)).not.toEqual(
    original.cards.map((c) => c.id),
  );
  expect(await search(page)).toEqual(changed);
  await page.getByRole("button", { name: "Ведущие осенью" }).click();
  await page.locator("#budget").fill("700000");
  const short = await search(page);
  expect(short.returned_count).toBe(2);
  await expect(page.locator(".summary")).toContainText(short.message);
  await expect(page.locator(".card")).toHaveCount(2);
  await page.getByRole("button", { name: "Редкие флористы" }).click();
  const florist = await search(page);
  expect(florist.cards.map((c) => c.id)).toEqual(["HK-39372"]);
  await expect(page.locator(".summary")).toContainText(florist.message);
  await page.getByRole("button", { name: "Бюджет 1 000 ₸" }).click();
  expect((await search(page)).status).toBe("no_matches");
  await expect(page.locator(".card")).toHaveCount(0);
  await page.getByRole("button", { name: "Изменить условия" }).click();
  await expect(page.locator("#city")).toBeFocused();
  await page
    .getByRole("button", { name: "Нет категории", exact: true })
    .click();
  expect((await search(page)).status).toBe("category_missing");
  await expect(page.locator(".card")).toHaveCount(0);
});

test("keyboard, inline errors and calendar limits prevent invalid requests", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#city").focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("date");
  expect(
    await page
      .locator("#date")
      .evaluate((e) => getComputedStyle(e).outlineStyle),
  ).not.toBe("none");
  await expect(page.locator("#date")).toHaveAttribute("min", "2026-09-23");
  await expect(page.locator("#date")).toHaveAttribute("max", "2026-12-31");
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/match")) posts++;
  });
  await page.locator("#date").fill("2026-09-22");
  await page.getByRole("button", { name: "Подобрать подрядчиков" }).click();
  await expect(page.locator("#date")).toBeFocused();
  await expect(page.locator("#date")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#date-error")).toBeVisible();
  await page.locator("#date").fill("2026-10-10");
  await page.locator("#budget").fill("0");
  await page.getByRole("button", { name: "Подобрать подрядчиков" }).click();
  await expect(page.locator("#budget")).toBeFocused();
  await expect(page.locator("#budget-error")).toBeVisible();
  expect(posts).toBe(0);
  await page.locator("#budget").fill("1000000");
  await page.locator("#hours").fill("");
  await page.locator("#language").selectOption("");
  const req = page.waitForRequest((r) => r.url().endsWith("/api/match"));
  await page.locator(".primary").focus();
  await page.keyboard.press("Enter");
  const body = (await req).postDataJSON();
  expect(body.language).toBeNull();
  expect(body.duration_hours).toBeNull();
  await expect(page.locator(".card")).toHaveCount(3);
  await page.locator(".card summary").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".card details").first()).toHaveAttribute(
    "open",
    "",
  );
});

test("mobile: completion does not scroll or steal focus; explicit results button does", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/match", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await page.locator(".primary").click();
  await expect(page.locator(".primary")).toBeDisabled();
  await page.locator("#budget").scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => window.scrollY);
  release();
  await expect(page.locator(".summary")).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(position);
  await expect(page.locator("#results-title")).not.toBeFocused();
  await page.getByRole("button", { name: "К результатам" }).click();
  await expect(page.locator("#results-title")).toBeFocused();
  expect((await page.locator("#results-title").boundingBox())!.y).toBeLessThan(
    60,
  );
});

test("stale real response cannot replace results after editing and resubmitting", async ({
  page,
}) => {
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/match", async (route) => {
    const response = await route.fetch();
    if (++calls === 1) await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.locator(".primary").click();
  await expect(page.locator(".primary")).toBeDisabled();
  await page.locator("#budget").fill("1000");
  await search(page);
  await expect(page.locator(".summary")).toContainText("НЕТ СОВПАДЕНИЙ");
  release();
  // Flush a browser task after the held response; don't rely on animation timers.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.locator(".card")).toHaveCount(0);
  await expect(page.locator(".summary")).toContainText("НЕТ СОВПАДЕНИЙ");
});

for (const scenario of ["422", "503", "non-json", "network"]) {
  test(`injected failure ${scenario}: visible error, preserved form, no demo fallback`, async ({
    page,
  }) => {
    await ready(page);
    await page.route("**/api/match", (route) =>
      scenario === "network"
        ? route.abort()
        : route.fulfill({
            status: scenario === "non-json" ? 502 : Number(scenario),
            contentType:
              scenario === "non-json" ? "text/html" : "application/json",
            body:
              scenario === "non-json"
                ? "<h1>Bad gateway</h1>"
                : JSON.stringify({
                    error: { message: "Проверочная ошибка API" },
                  }),
          }),
    );
    await page.locator(".primary").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("#budget")).toHaveValue("1000000");
    await expect(page.locator(".card")).toHaveCount(0);
    await expect(page.locator(".demo")).toHaveCount(0);
    await page.unroute("**/api/match");
    await search(page);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("long server text and AI/flags remain safe and fit every width", async ({
  page,
}) => {
  const response = await page.request.post("http://127.0.0.1:8000/api/match", {
    data: examples[0].request,
  });
  const data: Match = await response.json();
  data.cards[0].name = "ОченьДлинноеИмяБезПробелов".repeat(8);
  data.cards[0].explanation =
    "<script>window.injected=true</script> " +
    "Подробное объяснение из каталога. ".repeat(30);
  data.cards[0].evidence.push({
    field: "description",
    value: "длинныйфакт".repeat(100),
  });
  data.cards[0].flags = {
    synthetic: true,
    city_imputed: true,
    price_imputed: true,
  };
  data.cards[0].explanation_mode = "ai";
  await ready(page);
  await page.route("**/api/match", (route) => route.fulfill({ json: data }));
  await search(page);
  await page.locator(".card summary").first().click();
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await expect(page.locator(".card").first()).toContainText(
    "AI · цитату выбрала модель",
  );
  await expect(page.locator(".card").first()).toContainText(
    "Город дополнен · city_imputed",
  );
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
});

test("demo mode is explicit and covers the three outcomes without API calls", async ({
  page,
}) => {
  let apiCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiCalls++;
  });
  await page.goto("http://127.0.0.1:5174");
  await expect(page.locator(".demo")).toContainText(
    "Демонстрационные ответы интерфейса",
  );
  for (const [button, count] of [
    ["Ведущие осенью", 3],
    ["Редкие флористы", 1],
    ["Бюджет 1 000 ₸", 0],
    ["Нет категории", 0],
  ] as const) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.locator(".primary").click();
    await expect(page.locator(".summary")).toBeVisible();
    await expect(page.locator(".card")).toHaveCount(count);
  }
  expect(apiCalls).toBe(0);
});

test("metadata, favicon links and images resolve locally", async ({ page }) => {
  await ready(page);
  await expect(page).toHaveTitle("QNT Match — умный подбор подрядчиков");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://qnt.l33t.kz/og-qnt.png",
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    "content",
    "https://qnt.l33t.kz/og-qnt.png",
  );
  for (const path of [
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/og-qnt.png",
  ]) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/image\//);
  }
  const dimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/og-qnt.png";
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  });
  expect(dimensions).toEqual([1200, 630]);
});
