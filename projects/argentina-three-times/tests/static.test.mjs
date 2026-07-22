import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [html, css, js] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
]);

test("the site uses relative, build-free local assets", () => {
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /src="\.\/assets\/statsbomb-logo\.png"/);
  assert.match(js, /\.\/data\/argentina-world-cups\.json/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  assert.doesNotMatch(html, /https:\/\/(?:cdn|unpkg|esm\.sh)/);
});

test("the primary interactions expose keyboard and dialog semantics", () => {
  assert.match(html, /<dialog[^>]+id="notes-dialog"/);
  assert.match(html, /data-open-notes/);
  assert.match(html, /aria-live="polite"/);
  assert.match(js, /event\.key === "Enter"/);
  assert.match(js, /button\.type = "button"/);
});

test("responsive and reduced-motion rules are present", () => {
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /color-scheme:\s*light/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
  assert.match(html, /role="tablist"/);
  assert.match(js, /function setupLenses/);
});

test("the shipped payload remains lightweight and contains no placeholders", async () => {
  const dataSize = (await stat(new URL("data/argentina-world-cups.json", root))).size;
  assert.ok(dataSize < 500_000, `data payload is ${dataSize} bytes`);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /\b(?:TODO|Lorem ipsum|placeholder data)\b/i);
});
