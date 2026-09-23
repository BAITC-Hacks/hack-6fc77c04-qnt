import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve("dist");
const html = readFileSync(resolve(root, "index.html"), "utf8");
assert.match(html, /<html lang="ru">/);
assert.match(html, /<title>QNT Match — умный подбор подрядчиков<\/title>/);
for (const key of [
  "description",
  "viewport",
  "theme-color",
  "og:title",
  "og:description",
  "og:type",
  "og:site_name",
  "twitter:card",
  "twitter:title",
  "twitter:description",
]) {
  assert.match(html, new RegExp(`(?:name|property)="${key}"`), key);
}
assert.match(html, /charset="UTF-8"/);
for (const [, path] of html.matchAll(/(?:href|src)="(\/[^"?#]+)"/g)) {
  assert.ok(
    readFileSync(resolve(root, "." + path)).length,
    `Missing asset: ${path}`,
  );
}
const og = readFileSync(resolve(root, "og-qnt.png"));
assert.deepEqual([og.readUInt32BE(16), og.readUInt32BE(20)], [1200, 630]);
const apple = readFileSync(resolve(root, "apple-touch-icon.png"));
assert.deepEqual([apple.readUInt32BE(16), apple.readUInt32BE(20)], [180, 180]);
const ico = readFileSync(resolve(root, "favicon.ico"));
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 3);
for (let index = 0; index < 3; index++) {
  const entry = 6 + index * 16;
  assert.equal(ico[entry], [16, 32, 48][index]);
  assert.ok(
    ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8) <= ico.length,
  );
}
const images = [
  ...html.matchAll(
    /(?:property="og:image"|name="twitter:image") content="([^"]+)"/g,
  ),
].map((match) => match[1]);
if (process.env.VITE_PUBLIC_SITE_URL) {
  assert.deepEqual(
    images,
    Array(2).fill(
      new URL("/og-qnt.png", process.env.VITE_PUBLIC_SITE_URL).href,
    ),
  );
} else {
  assert.equal(images.length, 0, "Unconfigured build must not invent a domain");
}
const assets = readdirSync(resolve(root, "assets")).map((name) => ({
  name: `assets/${name}`,
  bytes: readFileSync(resolve(root, "assets", name)),
}));
if (process.env.VITE_DEMO_MODE !== "true") {
  for (const asset of assets.filter((a) => a.name.endsWith(".js"))) {
    assert.ok(
      !asset.bytes.includes(Buffer.from("Демонстрационные ответы интерфейса")),
      "Default bundle must not enable demo UI",
    );
  }
}
const all = [
  ...assets,
  ...readdirSync(root)
    .filter((name) => !name.includes("assets"))
    .map((name) => ({ name, bytes: readFileSync(resolve(root, name)) })),
];
for (const { name, bytes } of all)
  console.log(`${name}: ${bytes.length} B; gzip ${gzipSync(bytes).length} B`);
console.log(
  `TOTAL: ${all.reduce((sum, file) => sum + file.bytes.length, 0)} B`,
);
console.log(
  "PASS: metadata, linked assets, icon dimensions and default demo mode.",
);
