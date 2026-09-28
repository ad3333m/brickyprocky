// Copies the proxy runtime out of node_modules into docs/ and fetches the app
// icons, so the site is plain static files that GitHub Pages can serve.
// Usage: npm install && node tools/vendor.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const MW = path.join(ROOT, "node_modules", "@mercuryworkshop");

const COPIES = [
  ["scramjet/dist/scramjet.all.js", "scram/scramjet.all.js"],
  ["scramjet/dist/scramjet.sync.js", "scram/scramjet.sync.js"],
  ["scramjet/dist/scramjet.wasm.wasm", "scram/scramjet.wasm.wasm"],
  ["bare-mux/dist/index.js", "baremux/index.js"],
  ["bare-mux/dist/worker.js", "baremux/worker.js"],
  ["libcurl-transport/dist/index.mjs", "libcurl/index.mjs"],
  ["epoxy-transport/dist/index.mjs", "epoxy/index.mjs"],
];

// Simple Icons (CC0) brand marks for the suggested apps. A few brands were
// dropped from newer releases, so those pin the last version that had them.
const ICONS_VERSION = "16.33.0";
const ICONS = ["nvidia", "discord", "youtube", "spotify", "tiktok", "twitch", "reddit", "openai@15.0.0", "roblox", "xbox@11.0.0", "instagram", "x", "soundcloud", "pinterest"];

for (const [from, to] of COPIES) {
  const dest = path.join(DOCS, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(MW, from), dest);
  console.log(`copied ${to}`);
}

const iconDir = path.join(DOCS, "assets", "apps");
fs.mkdirSync(iconDir, { recursive: true });
for (const icon of ICONS) {
  const [name, version = ICONS_VERSION] = icon.split("@");
  const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@${version}/icons/${name}.svg`);
  if (!res.ok) throw new Error(`icon ${name}: HTTP ${res.status}`);
  // Paint with currentColor so the page decides the colour.
  const svg = (await res.text()).replace("<svg ", '<svg fill="currentColor" ');
  fs.writeFileSync(path.join(iconDir, `${name}.svg`), svg);
  console.log(`icon ${name}`);
}
