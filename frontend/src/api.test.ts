import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { demoMatch, examples } from "./demo";
afterEach(() => vi.unstubAllGlobals());
describe("contract fixtures", () => {
  it.each(examples)("$title preserves response invariants", ({ request }) => {
    const result = demoMatch(request);
    expect(result.cards.length).toBe(result.returned_count);
    expect(result.returned_count).toBe(Math.min(3, result.eligible_count));
    expect(
      result.rejections.reduce(
        (sum, item) => sum + item.count,
        result.eligible_count,
      ),
    ).toBe(result.total_in_category);
    expect(result.rejections.map((r) => r.code)).toEqual([
      "busy",
      "format",
      "budget",
      "language",
      "duration",
    ]);
    expect(
      result.cards.every(
        (c) => c.explanation_mode === "local" && c.flags.synthetic,
      ),
    ).toBe(true);
  });
  it("changes the date fixture and remains deterministic", () => {
    const request = examples[0].request;
    expect(demoMatch(request)).toEqual(demoMatch(request));
    expect(demoMatch({ ...request, date: "2026-10-11" }).cards).not.toEqual(
      demoMatch(request).cards,
    );
  });
  it("does not invent a match for unsupported demo inputs", () =>
    expect(() =>
      demoMatch({ ...examples[0].request, budget_kzt: 123 }),
    ).toThrow("фикстуры"));
});
describe("real API transport", () => {
  it("keeps the timeout message when reading the response body times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.reject(new DOMException("timeout", "TimeoutError")),
        }),
    );
    await expect(api("options", new AbortController().signal)).rejects.toThrow(
      "12 секунд",
    );
  });
  it("sends numeric values and nullable optional fields to relative API", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "no_matches" })),
      );
    vi.stubGlobal("fetch", fetch);
    const request = examples[2].request;
    await api("match", new AbortController().signal, request);
    expect(fetch.mock.calls[0][0]).toBe("/api/match");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(request);
  });
  it.each([422, 503])(
    "shows server error %s without demo fallback",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ error: { message: "Тестовая ошибка" } }),
              { status },
            ),
          ),
      );
      await expect(
        api("match", new AbortController().signal, examples[0].request),
      ).rejects.toThrow("Тестовая ошибка");
    },
  );
  it("reports non-JSON replies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>error</html>")),
    );
    await expect(api("options", new AbortController().signal)).rejects.toThrow(
      "неизвестном формате",
    );
  });
  it("reports network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(api("options", new AbortController().signal)).rejects.toThrow(
      "связаться с API",
    );
  });
  it("reports timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    );
    await expect(api("options", new AbortController().signal)).rejects.toThrow(
      "12 секунд",
    );
  });
});
