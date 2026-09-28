// Last resort for covers: runs each game that still has no picture in a
// headless browser and uses a screenshot of it. Takes two shots (before and
// after a click in the middle, which starts most "click to play" games) and
// keeps whichever has more going on; all-black loading screens are dropped.
//
// Needs the local preview running (node tools/serve.js 8093) and Edge or Chrome.
// Usage: node tools/snap-covers.js [preview origin]

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = path.join(ROOT, "docs", "games");
const CATALOG = path.join(GAMES, "catalog.json");
const SNAPS = path.join(ROOT, ".cache", "snaps");
const ORIGIN = process.argv[2] || "http://localhost:8093";
const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const WIDTH = 960;
const HEIGHT = 756; // same 1.27 shape as the cards
const PARALLEL = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gameUrl(game) {
  const site = `${ORIGIN}/brickyprocky/`;
  if (game.type === "doc" || game.type === "swf") return `${site}play.html?id=${encodeURIComponent(game.id)}`;
  if (game.type === "html") return site + game.src;
  return game.src;
}

// Heavy games can wedge the renderer; never wait on one call for long.
const within = (promise, ms, what) =>
  Promise.race([promise, sleep(ms).then(() => { throw new Error(`${what} took over ${ms / 1000}s`); })]);

async function snap(browser, game) {
  const first = path.join(SNAPS, `${game.id}.a.png`);
  const second = path.join(SNAPS, `${game.id}.b.png`);
  if (fs.existsSync(first) && fs.existsSync(second)) return [first, second]; // done on an earlier run

  let page;
  try {
    page = await within(browser.newPage(), 15000, "opening a tab");
    await page.setViewport({ width: WIDTH, height: HEIGHT });
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    page.setDefaultNavigationTimeout(45000);
    await within(page.goto(gameUrl(game), { waitUntil: "load" }).catch(() => {}), 50000, "loading");
    await sleep(game.type === "swf" ? 7000 : 10000);
    await within(page.screenshot({ path: first }), 20000, "first screenshot");
    await page.mouse.click(WIDTH / 2, HEIGHT / 2).catch(() => {});
    await sleep(5000);
    await within(page.screenshot({ path: second }), 20000, "second screenshot");
    return [first, second];
  } catch (err) {
    console.log(`  ${game.id}: ${err.message.split("\n")[0]}`);
    return fs.existsSync(first) ? [first] : null;
  } finally {
    if (page) within(page.close(), 10000, "closing").catch(() => {});
  }
}

function launch() {
  const executablePath = BROWSERS.find((p) => fs.existsSync(p));
  return puppeteer.launch({
    executablePath,
    headless: true,
    protocolTimeout: 60000,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const todo = catalog.games.filter((g) => !g.thumb);
  console.log(`${todo.length} games to screenshot`);
  if (!todo.length) return;
  fs.mkdirSync(SNAPS, { recursive: true });

  // One browser per worker, relaunched if a game crashes it.
  const jobs = [];
  const queue = todo.slice();
  let done = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      let browser = null;
      while (queue.length) {
        if (!browser || !browser.connected) {
          browser?.process()?.kill();
          browser = await launch();
          browser.on("targetcreated", async (t) => {
            // close pop-ups and new tabs games try to open
            if (t.type() === "page" && t.opener()) (await t.page())?.close().catch(() => {});
          });
        }
        const game = queue.shift();
        const shots = await snap(browser, game);
        if (shots) jobs.push({ from: shots, to: path.join(GAMES, "thumbs", game.id + ".webp") });
        else { browser.process()?.kill(); browser = null; } // start clean after a failure
        if (++done % 10 === 0) console.log(`  ${done}/${todo.length}`);
      }
      await browser?.close().catch(() => browser.process()?.kill());
    }),
  );

  const jobFile = path.join(ROOT, ".cache", "snap-covers.json");
  fs.writeFileSync(jobFile, JSON.stringify(jobs));
  execFileSync("python", [path.join(ROOT, "tools", "make_covers.py"), jobFile], { stdio: "inherit" });

  let added = 0;
  for (const game of catalog.games) {
    if (!game.thumb && fs.existsSync(path.join(GAMES, "thumbs", game.id + ".webp"))) {
      game.thumb = `games/thumbs/${game.id}.webp`;
      added++;
    }
  }
  fs.writeFileSync(CATALOG, JSON.stringify(catalog));
  console.log(`${added} covers from screenshots, ${catalog.games.filter((g) => !g.thumb).length} games still without one`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
