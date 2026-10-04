// Rebuilds docs/games/ from the Drive U 7 Google Site
// (https://sites.google.com/view/drive-u-7-home/home):
//
//   docs/games/catalog.json   every playable game and how to load it
//   docs/games/html/<id>.html games whose whole page lives inside the embed
//   docs/games/thumbs/<id>.webp cover art, where the site has one
//
// Each game page on that site wraps the real game in a Google Sites "embed"
// block (plus ads/analytics). We pull out just the game source so BrickyProcky
// can run it in its own player:
//   doc   - an HTML document on a CDN that gets written into the player frame
//   swf   - a Flash file, played with Ruffle
//   frame - a URL that can be framed directly (Apps Script web apps, poxel.io)
//   html  - the embed itself is the game page; saved to html/<id>.html
//
// Usage: node tools/build-catalog.js

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "games");
const CACHE = path.join(ROOT, ".cache");
const SITE = "https://sites.google.com/view/drive-u-7-home/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

// Pages that list games with cover images. Their image links are signed and
// expire within minutes, so covers are downloaded right after each listing.
const LISTINGS = ["home", "flash-games", "driving-games", "new-games", "friday-n-funkin-series", "fortzonna"];
const NOT_GAMES = new Set(["home", "contact", "chat-2", "flash-games", "driving-games", "new-games", "friday-n-funkin-series"]);
const SECTION_TAG = { "flash-games": "Flash", "driving-games": "Driving", "new-games": "New", "friday-n-funkin-series": "FNF" };

// Games that aren't on the Google Site.
const EXTRA = [
  {
    id: "poxel-io",
    name: "Poxel.io",
    type: "frame",
    // ?cg makes Poxel.io use its CrazyGames ad SDK, which shows nothing when the
    // game isn't on crazygames.com, so it plays without the pre-rolls and banners.
    src: "https://poxel.io/?cg",
    cover: "https://poxel.io/background-og.webp",
    tags: ["Shooter", ".io", "Multiplayer"],
    blurb: "Fast voxel FPS with players from all over the world.",
  },
];

// Keyword tags, tested against the game's name.
const TAG_RULES = [
  ["Shooter", /shoot|gun|sniper|\bwar\b|wars\b|battle|army|bullet|1v1|fps|strike|combat|tank|soldier|swat|mayhem|zombie|kill|pixel warfare|krunker|shell/i],
  ["Driving", /\bcars?\b|drive|driving|drift|\brac(e|es|ing|er)\b|moto|motor|bike|truck|parking|\broad\b|rider|highway|traffic|kart|\bbus\b|taxi|tractor|stunt|rally|speed|crash|gta/i],
  ["Sports", /basket|soccer|football|baseball|golf|tennis|hockey|\bpool\b|bowling|volley|boxing|wrestl|cricket|penalty|goal|dunk|skate|\bball\b|sports?|bowl|slam|run.?back|cup/i],
  ["Puzzle", /2048|puzzle|\bblock|tetris|sudoku|match|brain|\bword|chess|solitaire|mahjong|merge|\bsort|logic|maze|slice|cut\b/i],
  ["Horror", /fnaf|freddy|granny|horror|backrooms|scary|nights?\b|baldi|creepy|evil|haunt|madness|scream|ghost|dawn|tsunami/i],
  ["Clicker", /clicker|idle|tycoon|cookie|simulator|incremental|67/i],
  ["Platformer", /\brun\b|runner|jump|dash|escape|obby|parkour|tower|mario|sonic|platform|climb|geometry|\bvex\b|ninja|fireboy|watergirl|adventure|world/i],
  [".io", /\.io\b|-io\b|\bio\b/i],
  ["Multiplayer", /2 ?player|two player|\bduo\b|1v1|\bbros\b|random|\bvs\.?\b|online|among us/i],
  ["FNF", /funkin|\bfnf\b/i],
];

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { binary = false, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, ...headers },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      return { status: res.status, headers: res.headers, body };
    } catch (err) {
      if (attempt >= 2) return { status: 0, headers: new Headers(), body: binary ? Buffer.alloc(0) : "", error: String(err) };
      await sleep(1500);
    }
  }
}

async function pool(items, size, fn, label) {
  const queue = items.slice();
  let done = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        await fn(queue.shift());
        if (++done % 100 === 0) console.log(`  ${label} ${done}/${items.length}`);
      }
    }),
  );
}

const pageUrl = (slug) => SITE + slug;
const cacheName = (slug) => slug.replace(/\//g, "__");

// ---------------------------------------------------------------- listings

function parseNav(html) {
  const pages = new Map();
  for (const m of html.matchAll(/<a [^>]*href="\/view\/drive-u-7-home\/([^"#?]+)"[^>]*>([^<]*)<\/a>/g)) {
    const slug = m[1].replace(/\/$/, "");
    const name = decode(m[2]).replace(/\s+/g, " ").trim();
    if (!pages.has(slug) || (!pages.get(slug) && name)) pages.set(slug, name);
  }
  return pages;
}

function parseCovers(html) {
  const covers = new Map();
  for (const m of html.matchAll(/<a href="([^"]+)"[^>]*><div class="t3iYD"><img src="([^"]+)"/g)) {
    const slug = (decode(m[1]).match(/\/view\/drive-u-7-home\/([^?#"]+)/) || [])[1];
    if (slug) covers.set(slug.replace(/\/$/, ""), m[2].replace(/=w\d+[^"]*$/, ""));
  }
  return covers;
}

// ---------------------------------------------------------------- game pages

function parseGamePage(html) {
  return {
    codes: [...html.matchAll(/data-code="([^"]*)"/g)].map((m) => decode(m[1])),
    frames: [...html.matchAll(/<iframe[^>]*\ssrc="([^"]+)"/g)].map((m) => decode(m[1])),
  };
}

const NOT_A_DOC = /\.(js|mjs|css|json|png|jpe?g|gif|webp|svg|wasm|swf|ico|woff2?|ttf)(\?|#|$)/i;
const APPS_SCRIPT = /https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/;

function resolve(codes, frames, siteWideFrames) {
  const code = codes.join("\n");

  // An HTML document fetched at click time and written into the embed's iframe.
  const docPatterns = [
    /FILE_URL\s*=\s*(["'`])(https?:[^"'`]+)\1/,
    /\.open\(\s*["']GET["']\s*,\s*(["'`])(https?:[^"'`]+)\1/i,
    /fetch\(\s*(["'`])(https?:[^"'`]+)\1/,
    /(["'`])(https?:\/\/[^"'`\s]+\.xml)\1/i,
  ];
  for (const re of docPatterns) {
    const m = code.match(re);
    if (m && !NOT_A_DOC.test(m[2])) return { type: "doc", src: m[2] };
  }

  const swf = code.match(/https?:\/\/[^\s"'`<>\\]+?\.swf\b/i);
  if (swf) return { type: "swf", src: swf[0] };

  const gas = code.match(APPS_SCRIPT);
  if (gas) return { type: "frame", src: gas[0] };

  const page = codes.find((c) => /<html|<!doctype/i.test(c));
  if (page) return { type: "html", html: unwrapInline(page) };

  const iframe = code.match(/<iframe[^>]*\ssrc=["'](https?:[^"']+)/i);
  if (iframe) return { type: "frame", src: iframe[1] };

  // Some games are an Apps Script gadget placed straight on the page.
  const own = frames.filter((u) => APPS_SCRIPT.test(u) && !siteWideFrames.has(u));
  if (own.length) return { type: "frame", src: own[0] };

  return null;
}

// Launcher pages keep the real game in `const gameHTML = \`...\``; the rest is a
// play button, an IndexedDB cache and a pop-out window we don't need.
function unwrapInline(page) {
  const m = page.match(/const\s+gameHTML\s*=\s*`([\s\S]*?)`\s*(?:\.trim\(\))?\s*;/);
  if (m) {
    try {
      const inner = vm.runInNewContext("`" + m[1] + "`", {}, { timeout: 1000 });
      if (typeof inner === "string" && inner.trim()) return asDocument(inner.trim());
    } catch {
      // fall through to the full launcher page
    }
  }
  return stripAnalytics(page);
}

function asDocument(fragment) {
  if (/<html[\s>]/i.test(fragment)) return stripAnalytics(fragment);
  return (
    "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>\n" +
    "</head>\n<body>\n" +
    stripAnalytics(fragment) +
    "\n</body>\n</html>\n"
  );
}

function stripAnalytics(html) {
  return html
    .replace(/<script[^>]*googletagmanager\.com[^>]*>\s*<\/script>/gi, "")
    .replace(/<script>(?:(?!<\/script>)[\s\S])*?(?:gtag\(|dataLayer)(?:(?!<\/script>)[\s\S])*?<\/script>/gi, "");
}

// ---------------------------------------------------------------- checks

async function reachable(game) {
  const res = await get(game.src, { headers: { origin: "https://brickyprocky.github.io" } });
  if (res.status !== 200) return `HTTP ${res.status || res.error}`;
  if (game.type === "frame") {
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    const csp = res.headers.get("content-security-policy") || "";
    if (xfo === "deny" || xfo === "sameorigin") return "refuses to be framed (X-Frame-Options)";
    if (/frame-ancestors\s+(?!\*)/i.test(csp)) return "refuses to be framed (CSP)";
    return null;
  }
  const acao = res.headers.get("access-control-allow-origin");
  if (acao !== "*" && acao !== "https://brickyprocky.github.io") return "no CORS";
  if (game.type === "doc" && !/</.test(res.body)) return "not an HTML document";
  return null;
}

// ---------------------------------------------------------------- helpers

function slugToId(slug, used) {
  let id = slug.split("/").pop().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "game";
  if (used.has(id)) id = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  while (used.has(id)) id += "-2";
  used.add(id);
  return id;
}

function tagsFor(name, section, type) {
  const tags = new Set();
  if (SECTION_TAG[section]) tags.add(SECTION_TAG[section]);
  if (type === "swf") tags.add("Flash");
  for (const [tag, re] of TAG_RULES) if (re.test(name)) tags.add(tag);
  return [...tags];
}

function makeCovers(list) {
  // list: [{ from, to }] - resize to 360px wide WebP with Pillow
  if (!list.length) return;
  const job = path.join(CACHE, "covers.json");
  fs.writeFileSync(job, JSON.stringify(list));
  execFileSync("python", [path.join(ROOT, "tools", "make_covers.py"), job], { stdio: "inherit" });
}

// ---------------------------------------------------------------- main

async function main() {
  fs.mkdirSync(path.join(CACHE, "pages"), { recursive: true });
  fs.mkdirSync(path.join(CACHE, "covers"), { recursive: true });

  console.log("Reading listings and covers…");
  const nav = new Map();
  const coverFiles = new Map(); // slug -> downloaded file
  for (const listing of LISTINGS) {
    const res = await get(pageUrl(listing));
    if (res.status !== 200) throw new Error(`Listing ${listing} returned ${res.status}`);
    for (const [slug, name] of parseNav(res.body)) if (!nav.has(slug) || !nav.get(slug)) nav.set(slug, name);
    const covers = [...parseCovers(res.body)].filter(([slug]) => !coverFiles.has(slug));
    await pool(covers, 8, async ([slug, url]) => {
      const img = await get(url + "=w480", { binary: true });
      if (img.status === 200 && img.body.length > 200) {
        const file = path.join(CACHE, "covers", cacheName(slug) + ".img");
        fs.writeFileSync(file, img.body);
        coverFiles.set(slug, file);
      }
    }, "covers");
    console.log(`  ${listing}: ${covers.length} covers`);
  }
  console.log(`${nav.size} pages in the site menu, ${coverFiles.size} covers`);

  console.log("Reading game pages…");
  const pages = new Map();
  const slugs = [...nav.keys()].filter((s) => !NOT_GAMES.has(s));
  await pool(slugs, 8, async (slug) => {
    const file = path.join(CACHE, "pages", cacheName(slug) + ".html");
    let html;
    if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 24 * 3600e3) {
      html = fs.readFileSync(file, "utf8");
    } else {
      const res = await get(pageUrl(slug));
      if (res.status !== 200) return;
      html = res.body;
      fs.writeFileSync(file, html);
    }
    pages.set(slug, parseGamePage(html));
  }, "pages");

  // Apps Script gadgets on lots of pages are site furniture (chat, links), not games.
  const frameCount = new Map();
  for (const p of pages.values()) for (const u of new Set(p.frames)) frameCount.set(u, (frameCount.get(u) || 0) + 1);
  const siteWide = new Set([...frameCount].filter(([, n]) => n > 3).map(([u]) => u));

  console.log("Resolving and checking sources…");
  const used = new Set(EXTRA.map((g) => g.id));
  const games = [];
  const skipped = [];
  for (const slug of slugs) {
    const page = pages.get(slug);
    if (!page) { skipped.push([slug, "page failed to load"]); continue; }
    const found = resolve(page.codes, page.frames, siteWide);
    if (!found) { skipped.push([slug, "no game embed"]); continue; }
    const name = nav.get(slug) || slug.split("/").pop();
    const section = slug.includes("/") ? slug.split("/")[0] : "";
    games.push({ slug, id: slugToId(slug, used), name, ...found, tags: tagsFor(name, section, found.type) });
  }

  const remote = games.filter((g) => g.src);
  await pool(remote, 10, async (g) => { g.problem = await reachable(g); }, "checks");
  for (const g of EXTRA) g.problem = await reachable(g);

  // ---------------------------------------------------------------- write
  // thumbs/ is kept: covers from find-covers.js and snap-covers.js live there too.
  fs.rmSync(path.join(OUT, "html"), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "html"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "thumbs"), { recursive: true });

  const catalog = [];
  const coverJobs = [];
  for (const g of [...EXTRA, ...games]) {
    if (g.problem) { skipped.push([g.slug || g.id, g.problem]); continue; }
    const entry = { id: g.id, name: g.name, type: g.type, src: g.src, tags: g.tags };
    if (g.blurb) entry.blurb = g.blurb;
    if (g.type === "html") {
      fs.writeFileSync(path.join(OUT, "html", g.id + ".html"), g.html);
      entry.src = "games/html/" + g.id + ".html";
    }
    if (g.cover) {
      const img = await get(g.cover, { binary: true });
      if (img.status === 200) {
        const file = path.join(CACHE, "covers", g.id + ".img");
        fs.writeFileSync(file, img.body);
        // Hand-added games also fill the wide "Featured" banner, so keep them big.
        coverJobs.push({ from: file, to: path.join(OUT, "thumbs", g.id + ".webp"), width: 1280 });
        entry.thumb = "games/thumbs/" + g.id + ".webp";
      }
    } else if (coverFiles.has(g.slug)) {
      coverJobs.push({ from: coverFiles.get(g.slug), to: path.join(OUT, "thumbs", g.id + ".webp") });
      entry.thumb = "games/thumbs/" + g.id + ".webp";
    } else if (fs.existsSync(path.join(OUT, "thumbs", g.id + ".webp"))) {
      entry.thumb = "games/thumbs/" + g.id + ".webp"; // found or snapped on an earlier run
    }
    catalog.push(entry);
  }
  makeCovers(coverJobs);

  // Covers that came out bad (warning screens, loading pages, engine logos) are
  // dropped so those games show a clean name tile. See tools/bad-covers.json;
  // find-covers.js and snap-covers.js skip these too.
  const badFile = path.join(ROOT, "tools", "bad-covers.json");
  if (fs.existsSync(badFile)) {
    const bad = new Set(JSON.parse(fs.readFileSync(badFile, "utf8")));
    for (const g of catalog) if (bad.has(g.id)) delete g.thumb;
  }

  const keep = new Set(catalog.map((g) => g.id + ".webp"));
  for (const file of fs.readdirSync(path.join(OUT, "thumbs"))) {
    if (!keep.has(file)) fs.rmSync(path.join(OUT, "thumbs", file));
  }

  const extraIds = new Set(EXTRA.map((g) => g.id));
  catalog.sort((a, b) => (extraIds.has(b.id) - extraIds.has(a.id)) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  // The site has a few games listed twice under different pages; number the repeats.
  const seen = new Map();
  for (const g of catalog) {
    const key = g.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) g.name += ` (${n})`;
  }
  fs.writeFileSync(
    path.join(OUT, "catalog.json"),
    JSON.stringify({ source: SITE + "home", built: new Date().toISOString(), games: catalog }),
  );

  const byType = {};
  for (const g of catalog) byType[g.type] = (byType[g.type] || 0) + 1;
  console.log(`\n${catalog.length} games written`, byType, `${coverJobs.length} covers`);
  console.log(`${skipped.length} skipped:`);
  for (const [slug, why] of skipped) console.log(`  ${slug}: ${why}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
