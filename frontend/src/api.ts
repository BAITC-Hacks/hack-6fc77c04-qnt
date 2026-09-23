import { demoMatch, demoOptions } from "./demo";
import type { Options, Match, Request } from "./types";
export const demo = import.meta.env.VITE_DEMO_MODE === "true";
export async function api<T>(
  path: string,
  signal: AbortSignal,
  body?: Request,
): Promise<T> {
  if (demo) return (body ? demoMatch(body) : demoOptions) as T;
  try {
    const response = await fetch(`/api/${path}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const data = await response.json().catch((error: unknown) => {
      if (
        error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
      )
        throw error;
      throw new Error(
        "Сервер вернул ответ в неизвестном формате. Попробуйте ещё раз.",
      );
    });
    if (!response.ok)
      throw new Error(
        data?.error?.message ||
          `Ошибка сервера (${response.status}). Повторите попытку.`,
      );
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error("Сервер не ответил за 12 секунд. Повторите попытку.");
    if (error instanceof TypeError)
      throw new Error(
        "Не удалось связаться с API. Проверьте подключение и повторите попытку.",
      );
    throw error;
  }
}
export const getOptions = (signal: AbortSignal) =>
  api<Options>("options", signal);
export const match = (body: Request, signal: AbortSignal) =>
  api<Match>("match", signal, body);
