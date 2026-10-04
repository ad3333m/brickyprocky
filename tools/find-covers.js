// Finds cover art for games the Drive U 7 site has no picture for, by looking
// the game up in public catalogs, and writes docs/games/thumbs/<id>.webp.
//
//   Scratch     - project thumbnail (for Scratch embeds)
//   CrazyGames  - og:image of crazygames.com/game/<slug>
//   Poki        - og:image of poki.com/en/g/<slug>
//   Flashpoint  - logo from the Flashpoint archive, exact title match
//   Steam       - store header image, exact title match
//
// Games still without a cover afterwards are handled by snap-covers.js.
// Usage: node tools/find-covers.js

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = path.join(ROOT, "docs", "games");
const CATALOG = path.join(GAMES, "catalog.json");
const CACHE = path.join(ROOT, ".cache");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const baseName = (s) => s.replace(/\s*\(\d+\)$/, "");

async function get(url, { redirect = "follow", binary = false } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
        redirect,
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return { status: res.status, body: binary ? Buffer.from(await res.arrayBuffer()) : await res.text() };
    } catch {
      await sleep(1500);
    }
  }
  return { status: 0, body: binary ? Buffer.alloc(0) : "" };
}

const ogImage = (html) => ((html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || "").replace(/&amp;/g, "&");

function slugsFor(game) {
  const slug = slugify(baseName(game.name));
  const out = [slug];
  if (/-io$/.test(slug)) out.push(slug.replace(/-io$/, ""));
  return out;
}

const SOURCES = {
  async scratch(game) {
    const m = (game.src || "").match(/scratch\.mit\.edu\/projects\/(\d+)/);
    return m && `https://cdn2.scratch.mit.edu/get_image/project/${m[1]}_480x360.png`;
  },
  async crazygames(game) {
    for (const slug of slugsFor(game)) {
      await sleep(400); // CrazyGames throttles bursts
      const res = await get(`https://www.crazygames.com/game/${slug}`, { redirect: "manual" });
      const img = res.status === 200 && ogImage(res.body);
      if (img && /imgs\.crazygames\.com/.test(img)) return img.replace(/width=\d+&height=\d+/, "width=640&height=360");
    }
  },
  async poki(game) {
    for (const slug of slugsFor(game)) {
      const res = await get(`https://poki.com/en/g/${slug}`, { redirect: "manual" });
      const img = res.status === 200 && ogImage(res.body);
      if (img && /poki-cdn/.test(img)) return img.replace(/width=1200,height=1200/, "width=512,height=512");
    }
  },
  async flashpoint(game) {
    const name = baseName(game.name);
    const res = await get(`https://db-api.unstable.life/search?smartSearch=${encodeURIComponent(name)}&filter=true&fields=id,title,platform`);
    let rows;
    try { rows = JSON.parse(res.body); } catch { return; }
    const platform = game.type === "swf" ? "Flash" : "HTML5";
    const hits = rows.filter((r) => norm(r.title) === norm(name)).sort((a, b) => (b.platform === platform) - (a.platform === platform));
    for (const hit of hits) {
      const url = `https://infinity.unstable.life/images/Logos/${hit.id.slice(0, 2)}/${hit.id.slice(2, 4)}/${hit.id}.png`;
      if ((await get(url, { binary: true })).status === 200) return url;
    }
  },
  async steam(game) {
    const name = baseName(game.name);
    const res = await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=us&l=english`);
    let data;
    try { data = JSON.parse(res.body); } catch { return; }
    const hit = (data.items || []).find((i) => norm(i.name) === norm(name));
    return hit && `https://cdn.cloudflare.steamstatic.com/steam/apps/${hit.id}/header.jpg`;
  },
};

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const badFile = path.join(ROOT, "tools", "bad-covers.json");
  const bad = fs.existsSync(badFile) ? new Set(JSON.parse(fs.readFileSync(badFile, "utf8"))) : new Set();
  const todo = catalog.games.filter((g) => !bad.has(g.id) && (!g.thumb || !fs.existsSync(path.join(ROOT, "docs", g.thumb))));
  console.log(`${todo.length} games without a cover`);

  fs.mkdirSync(path.join(CACHE, "covers"), { recursive: true });
  const jobs = [];
  const found = {};
  const queue = todo.slice();
  let done = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const game = queue.shift();
        for (const [source, lookup] of Object.entries(SOURCES)) {
          const url = await lookup(game);
          if (!url) continue;
          const img = await get(url, { binary: true });
          if (img.status !== 200 || img.body.length < 500) continue;
          const file = path.join(CACHE, "covers", game.id + ".found");
          fs.writeFileSync(file, img.body);
          jobs.push({ from: file, to: path.join(GAMES, "thumbs", game.id + ".webp") });
          found[game.id] = source;
          break;
        }
        if (++done % 25 === 0) console.log(`  ${done}/${todo.length}, ${Object.keys(found).length} found`);
      }
    }),
  );

  if (jobs.length) {
    const jobFile = path.join(CACHE, "found-covers.json");
    fs.writeFileSync(jobFile, JSON.stringify(jobs));
    execFileSync("python", [path.join(ROOT, "tools", "make_covers.py"), jobFile], { stdio: "inherit" });
  }
  for (const game of catalog.games) {
    if (found[game.id] && fs.existsSync(path.join(GAMES, "thumbs", game.id + ".webp"))) game.thumb = `games/thumbs/${game.id}.webp`;
  }
  fs.writeFileSync(CATALOG, JSON.stringify(catalog));

  const bySource = {};
  for (const s of Object.values(found)) bySource[s] = (bySource[s] || 0) + 1;
  console.log(`covers found for ${Object.keys(found).length} games`, bySource);
  console.log(`${catalog.games.filter((g) => !g.thumb).length} still without a cover`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
