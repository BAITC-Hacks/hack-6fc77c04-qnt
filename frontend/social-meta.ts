// Public build setting only. Never put credentials into VITE_* variables.
export function socialImageUrl(
  siteUrl: string | undefined,
): string | undefined {
  if (!siteUrl?.trim()) return undefined;
  const url = new URL(siteUrl.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      "VITE_PUBLIC_SITE_URL must be a public HTTPS origin, without credentials, path, query or hash.",
    );
  }
  return new URL("/og-qnt.png", url).href;
}
