import { describe, expect, it } from "vitest";
import { demoOptions } from "./demo";
import { evidenceLabel, validateForm, type FormValues } from "./presentation";
import { socialImageUrl } from "../social-meta";
const form: FormValues = {
  city: "Алматы",
  category: "Ведущий",
  date: "2026-10-10",
  event_format: "корпоратив",
  budget_kzt: "1000000",
  language: "русский",
  duration_hours: "4",
};
describe("accessible form validation", () => {
  it("accepts calendar boundaries, a one-tenge budget and optional null-equivalent inputs", () => {
    for (const date of [demoOptions.date_min, demoOptions.date_max])
      expect(
        validateForm(
          { ...form, date, budget_kzt: "1", language: "", duration_hours: "" },
          demoOptions,
        ),
      ).toEqual({});
  });
  it.each(["", "2026-09-22", "2027-01-01", "2026-11-31", "bad"])(
    "rejects invalid date %s",
    (date) =>
      expect(validateForm({ ...form, date }, demoOptions).date).toBeTruthy(),
  );
  it.each(["0", "-1", "1.5", "Infinity", "9007199254740992"])(
    "rejects invalid budget %s",
    (budget_kzt) =>
      expect(
        validateForm({ ...form, budget_kzt }, demoOptions).budget_kzt,
      ).toBeTruthy(),
  );
  it("permits positive fractional hours without imposing a new server constraint", () =>
    expect(
      validateForm({ ...form, duration_hours: "0.001" }, demoOptions),
    ).toEqual({}));
  it.each(["0", "-1", "Infinity"])(
    "rejects invalid hours %s",
    (duration_hours) =>
      expect(
        validateForm({ ...form, duration_hours }, demoOptions).duration_hours,
      ).toBeTruthy(),
  );
  it("rejects unknown dictionary values", () =>
    expect(
      Object.keys(
        validateForm(
          {
            ...form,
            city: "x",
            category: "x",
            event_format: "x",
            language: "x",
          },
          demoOptions,
        ),
      ),
    ).toEqual(["city", "event_format", "category", "language"]));
});
describe("presentation only", () => {
  it("translates server evidence labels and handles future unknown keys", () => {
    expect(evidenceLabel("busy_dates")).toBe("Занятость по календарю");
    expect(evidenceLabel("ranking")).toBe("Основание порядка выдачи");
    expect(evidenceLabel("new_field")).toBe("Факт из каталога");
    expect(evidenceLabel("Источник")).toBe("Источник");
  });
});
describe("public social image URL", () => {
  it("omits image metadata until a site is configured", () =>
    expect(socialImageUrl("")).toBeUndefined());
  it("uses an absolute HTTPS asset URL", () =>
    expect(socialImageUrl("https://qnt.l33t.kz")).toBe(
      "https://qnt.l33t.kz/og-qnt.png",
    ));
  it.each([
    "http://qnt.l33t.kz",
    "https://localhost",
    "https://u:p@example.com",
    "https://example.com/path",
    "https://example.com/?key=1",
  ])("rejects invalid origins %s", (url) =>
    expect(() => socialImageUrl(url)).toThrow(),
  );
});
