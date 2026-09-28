/* BrickyProcky: routing, games, proxy */
(() => {
  "use strict";

  const BASE = new URL("./", location.href).pathname; // "/brickyprocky/" on GitHub Pages
  const PROXY_PREFIX = BASE + "go/";

  // Public Wisp relays. The proxy encrypts pages in the browser (TLS inside the
  // relay tunnel), so a relay only ever sees which host you connect to.
  const RELAYS = ["wss://wisp.mercurywork.shop/", "wss://anura.pro/"];
  const RELAY_NAMES = { "wss://wisp.mercurywork.shop/": "Mercury Workshop", "wss://anura.pro/": "Anura" };

  const APPS = [
    { name: "GeForce NOW", url: "https://play.geforcenow.com/", icon: "nvidia", color: "#76b900" },
    { name: "Discord", url: "https://discord.com/app", icon: "discord", color: "#7b87ff" },
    { name: "YouTube", url: "https://www.youtube.com/", icon: "youtube", color: "#ff3355" },
    { name: "Spotify", url: "https://open.spotify.com/", icon: "spotify", color: "#1ed760" },
    { name: "TikTok", url: "https://www.tiktok.com/", icon: "tiktok", color: "#25f4ee" },
    { name: "Twitch", url: "https://www.twitch.tv/", icon: "twitch", color: "#a970ff" },
    { name: "Reddit", url: "https://www.reddit.com/", icon: "reddit", color: "#ff5722" },
    { name: "ChatGPT", url: "https://chatgpt.com/", icon: "openai", color: "#19c39c" },
    { name: "Roblox", url: "https://now.gg/apps/roblox-corporation/5349/roblox.html", icon: "roblox", color: "#f2f4ff" },
    { name: "Xbox Cloud", url: "https://www.xbox.com/play", icon: "xbox", color: "#3fc83f" },
    { name: "Instagram", url: "https://www.instagram.com/", icon: "instagram", color: "#ff4f8b" },
    { name: "X", url: "https://x.com/", icon: "x", color: "#f2f4ff" },
  ];

  const CHIPS = [
    { id: "all", label: "All" },
    { id: "fav", label: "Favourites" },
    { id: "recent", label: "Recent" },
    { id: "New", label: "New" },
    { id: ".io", label: ".io" },
    { id: "Shooter", label: "Shooter" },
    { id: "Driving", label: "Driving" },
    { id: "Sports", label: "Sports" },
    { id: "Platformer", label: "Platformer" },
    { id: "Puzzle", label: "Puzzle" },
    { id: "Horror", label: "Horror" },
    { id: "Clicker", label: "Clicker" },
    { id: "Multiplayer", label: "2 Player & Online" },
    { id: "Flash", label: "Flash" },
    { id: "FNF", label: "Friday Night Funkin'" },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const hostOf = (url) => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; } };
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

  // Per-viewer conveniences (favourites, recents, settings). Storage can be
  // blocked or wiped, so everything has a fallback.
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem("bp:" + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem("bp:" + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const settings = Object.assign(
    { relay: "auto", relayCustom: "", transport: "libcurl", engine: "https://duckduckgo.com/?q=%s" },
    store.get("settings", {}),
  );

  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  // ------------------------------------------------------------------ apps

  function appTile(app) {
    const icon = `url('${BASE}assets/apps/${app.icon}.svg')`;
    return `<button class="app" type="button" data-url="${esc(app.url)}" title="Open ${esc(app.name)} in the proxy">
      <span class="app-icon glass" style="--brand:${app.color};--icon:${icon}"></span>
      <span>${esc(app.name)}</span>
    </button>`;
  }

  function renderApps() {
    $("#homeApps").innerHTML = APPS.slice(0, 8).map(appTile).join("");
    $("#proxyApps").innerHTML = APPS.map(appTile).join("");
  }

  // ------------------------------------------------------------------ routing

  let currentView = null;
  let lastHash = null;
  let playerCameFrom = null;
  let browserCameFrom = null;

  function route() {
    const hash = location.hash || "#/";
    const [, section = "", ...rest] = hash.replace(/^#/, "").split("/");
    const arg = rest.join("/");

    let view = "home";
    if (section === "games" || section === "play") view = "games";
    if (section === "proxy" || section === "browse") view = "proxy";
    showView(view);

    if (section === "play" && arg) {
      if (!playingId) playerCameFrom = lastHash;
      openPlayer(decodeURIComponent(arg));
    } else {
      closePlayer();
    }

    if (section === "browse" && arg) {
      if (!browsing) browserCameFrom = lastHash;
      openBrowser(decodeURIComponent(arg));
    } else {
      closeBrowser();
    }

    lastHash = hash;
  }

  // Leave an overlay: step back if we came from inside the app, otherwise
  // replace the entry so Back doesn't bounce into the overlay again.
  function leave(cameFrom, fallback) {
    if (cameFrom && !/^#\/(play|browse)\//.test(cameFrom)) history.back();
    else location.replace(fallback);
  }

  function showView(name) {
    if (currentView === name) return;
    currentView = name;
    for (const v of $$(".view")) v.hidden = v.dataset.view !== name;
    for (const a of $$(".tabs a")) a.classList.toggle("active", a.dataset.tab === name);
    moveGlider();
    document.title = name === "home" ? "BrickyProcky" : `${name === "games" ? "Games" : "Proxy"} · BrickyProcky`;
    window.scrollTo(0, 0);
    if (name === "games") renderGames();
    if (name === "proxy") initProxy().catch(() => {});
  }

  function moveGlider() {
    const glider = $(".tab-glider");
    const active = $(".tabs a.active");
    if (!active) { glider.style.opacity = "0"; return; }
    glider.style.opacity = "1";
    glider.style.width = active.offsetWidth + "px";
    glider.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  // ------------------------------------------------------------------ games

  let games = [];
  let byId = new Map();
  let catalogPromise = null;
  let cards = [];
  let gridBuilt = false;
  let activeChip = "all";
  let query = "";
  const favs = new Set(store.get("favs", []));

  function loadCatalog() {
    if (!catalogPromise) {
      // GitHub Pages caches files for 10 minutes; revalidate so updates show at once.
      catalogPromise = fetch("games/catalog.json", { cache: "no-cache" })
        .then((res) => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then((data) => {
          games = data.games;
          byId = new Map(games.map((g) => [g.id, g]));
          for (const el of $$(".game-total")) el.textContent = games.length;
          return games;
        })
        .catch((err) => {
          catalogPromise = null;
          throw err;
        });
    }
    return catalogPromise;
  }

  function hue(str) {
    let h = 7;
    for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  }

  function cardHTML(g) {
    const h = hue(g.id);
    const fav = favs.has(g.id);
    const img = g.thumb
      ? `<img src="${esc(g.thumb)}" alt="" loading="lazy" decoding="async" class="pending" onload="this.classList.remove('pending')" onerror="this.remove()">`
      : "";
    return `<a class="card" href="#/play/${encodeURIComponent(g.id)}" data-id="${esc(g.id)}">
      <div class="thumb">
        <div class="gen" style="--h:${h};--h2:${(h + 55) % 360}"><span>${esc(g.name)}</span></div>
        ${img}
        ${g.type === "swf" ? '<span class="tag">Flash</span>' : ""}
        <div class="play-hint"><span><svg><use href="#i-play"/></svg></span></div>
      </div>
      <div class="card-meta">
        <span class="card-name" title="${esc(g.name)}">${esc(g.name)}</span>
        <button class="fav${fav ? " on" : ""}" type="button" data-fav="${esc(g.id)}" aria-pressed="${fav}" aria-label="Favourite ${esc(g.name)}"><svg><use href="#i-star"/></svg></button>
      </div>
    </a>`;
  }

  async function renderGames() {
    if (gridBuilt) { renderRecent(); updateChips(); applyFilter(); return; }
    try {
      await loadCatalog();
    } catch {
      $("#grid").innerHTML = `<div class="empty">Couldn't load the game list. <button class="btn" type="button" onclick="location.reload()">Try again</button></div>`;
      return;
    }
    if (gridBuilt) return;
    gridBuilt = true;

    const grid = $("#grid");
    grid.innerHTML = games.map(cardHTML).join("");
    cards = $$(".card", grid).map((el) => {
      const g = byId.get(el.dataset.id);
      return { el, g, hay: norm(g.name + " " + g.tags.join(" ")) };
    });

    $("#chips").innerHTML = CHIPS.map(
      (c) => `<button class="chip${c.id === activeChip ? " active" : ""}" type="button" role="tab" data-chip="${esc(c.id)}">${esc(c.label)} <small></small></button>`,
    ).join("");

    renderFeatured();
    renderRecent();
    updateChips();
    applyFilter();
  }

  function renderFeatured() {
    const g = byId.get("poxel-io");
    if (!g) return;
    $("#featured").innerHTML = `<div class="feature" style="background-image:url('${esc(g.thumb || "")}')">
      <div class="feature-body">
        <span class="badge"><svg><use href="#i-star"/></svg> Featured</span>
        <h3>${esc(g.name)}</h3>
        <p>${esc(g.blurb || "")}</p>
        <a class="btn primary" href="#/play/${encodeURIComponent(g.id)}"><svg><use href="#i-play"/></svg> Play now</a>
      </div>
    </div>`;
  }

  function recentIds() {
    return store.get("recent", []).filter((id) => byId.has(id));
  }

  function renderRecent() {
    const ids = recentIds().slice(0, 12);
    $("#recent").innerHTML = ids.length
      ? `<div class="strip"><div class="section-label">Jump back in</div><div class="strip-row">${ids.map((id) => cardHTML(byId.get(id))).join("")}</div></div>`
      : "";
  }

  function countFor(chip) {
    if (chip === "all") return games.length;
    if (chip === "fav") return games.filter((g) => favs.has(g.id)).length;
    if (chip === "recent") return recentIds().length;
    return games.filter((g) => g.tags.includes(chip)).length;
  }

  function updateChips() {
    for (const btn of $$(".chip")) {
      const n = countFor(btn.dataset.chip);
      btn.querySelector("small").textContent = n;
      btn.classList.toggle("active", btn.dataset.chip === activeChip);
      btn.setAttribute("aria-selected", btn.dataset.chip === activeChip);
      btn.hidden = n === 0 && btn.dataset.chip !== "all" && btn.dataset.chip !== activeChip;
    }
  }

  function applyFilter() {
    const q = norm(query);
    const recents = recentIds();
    let shown = 0;
    for (const card of cards) {
      let ok = true;
      if (activeChip === "fav") ok = favs.has(card.g.id);
      else if (activeChip === "recent") ok = recents.includes(card.g.id);
      else if (activeChip !== "all") ok = card.g.tags.includes(activeChip);
      if (ok && q) ok = card.hay.includes(q);
      card.el.hidden = !ok;
      card.el.style.order = activeChip === "recent" && ok ? recents.indexOf(card.g.id) : "";
      if (ok) shown++;
    }
    $("#gamesEmpty").hidden = shown > 0;
    const plain = activeChip === "all" && !q;
    $("#featured").hidden = !plain;
    $("#recent").hidden = !plain;
  }

  function toggleFav(id) {
    if (favs.has(id)) favs.delete(id);
    else favs.add(id);
    store.set("favs", [...favs]);
    const on = favs.has(id);
    for (const b of $$(`[data-fav="${CSS.escape(id)}"]`)) {
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    }
    if (playingId === id) $('#player [data-act="fav"]').classList.toggle("on", on);
    toast(on ? `Added ${byId.get(id)?.name || "game"} to favourites` : "Removed from favourites");
    updateChips();
    if (activeChip === "fav") applyFilter();
  }

  function pushRecent(id) {
    const list = store.get("recent", []).filter((x) => x !== id);
    list.unshift(id);
    store.set("recent", list.slice(0, 30));
  }

  // ------------------------------------------------------------------ player

  let playingId = null;

  async function openPlayer(id) {
    if (playingId === id) return;
    try {
      await loadCatalog();
    } catch {
      toast("Couldn't load the game list.");
      return;
    }
    const g = byId.get(id);
    if (!g) {
      toast("That game isn't in the catalog any more.");
      location.replace("#/games");
      return;
    }
    playingId = id;
    $("#player").hidden = false;
    document.body.style.overflow = "hidden";
    $("#playerName").textContent = g.name;
    $("#playerTags").textContent = g.tags.length ? g.tags.join(" · ") : "Game";
    const h = hue(g.id);
    $("#playerThumb").style.backgroundImage = g.thumb
      ? `url('${g.thumb}')`
      : `linear-gradient(135deg, hsl(${h} 70% 40%), hsl(${(h + 55) % 360} 70% 24%))`;
    $('#player [data-act="fav"]').classList.toggle("on", favs.has(id));
    document.title = `${g.name} · BrickyProcky`;
    mountGame(g);
    pushRecent(id);
  }

  function mountGame(g) {
    const stage = $("#playerStage");
    stage.querySelector("iframe")?.remove();
    const loading = $("#playerLoading");
    loading.classList.remove("done");
    $("#playerLoadingText").textContent = `Loading ${g.name}…`;

    const frame = document.createElement("iframe");
    frame.title = g.name;
    frame.allow = "autoplay; fullscreen; gamepad; pointer-lock; keyboard-map; clipboard-read; clipboard-write; screen-wake-lock";
    frame.allowFullscreen = true;
    // Games we load ourselves go through the runner page, which blocks their ads;
    // other sites' games (Apps Script, Scratch, Poxel.io) are framed as they are.
    frame.src = g.type === "frame" ? g.src : `play.html?id=${encodeURIComponent(g.id)}`;

    let revealed = false;
    const reveal = () => {
      if (revealed || frame !== stage.querySelector("iframe")) return;
      revealed = true;
      loading.classList.add("done");
      frame.focus();
    };
    frame.addEventListener("load", () => setTimeout(reveal, 150));
    setTimeout(reveal, 15000);
    stage.append(frame);
  }

  function closePlayer() {
    if (!playingId) return;
    playingId = null;
    $("#playerStage iframe")?.remove();
    $("#player").hidden = true;
    document.body.style.overflow = "";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (currentView === "games") {
      document.title = "Games · BrickyProcky";
      renderRecent();
      updateChips();
    }
  }

  function fullscreen(el) {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!request) {
      toast("Full screen isn't available here.");
      return;
    }
    Promise.resolve(request.call(el)).catch(() => toast("Full screen isn't available here."));
  }

  // ------------------------------------------------------------------ proxy

  class ProxyError extends Error {
    constructor(message, relay = false) {
      super(message);
      this.relay = relay;
    }
  }

  let proxyReady = null;
  let scramjet = null;
  let bareConn = null;
  let relayInUse = null;

  function setRelayStatus(state, text) {
    const el = $("#relay");
    el.className = "relay " + state;
    $("#relayText").textContent = text;
  }

  function relayCandidates() {
    if (settings.relay === "custom") return settings.relayCustom ? [settings.relayCustom] : RELAYS;
    if (settings.relay !== "auto") return [settings.relay];
    return RELAYS;
  }

  // A relay counts as up once its WebSocket opens.
  function probe(url, timeout = 7000) {
    return new Promise((resolve, reject) => {
      let ws;
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* already closed */ }
        reject(new Error("timeout"));
      }, timeout);
      try {
        ws = new WebSocket(url);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      ws.onopen = () => {
        clearTimeout(timer);
        ws.close();
        resolve(url);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("error"));
      };
    });
  }

  async function connectRelay() {
    setRelayStatus("busy", "Connecting to a proxy relay…");
    let relay;
    try {
      relay = await Promise.any(relayCandidates().map((u) => probe(u)));
    } catch {
      setRelayStatus("bad", "Couldn't reach a proxy relay");
      throw new ProxyError("Couldn't reach a proxy relay. Your network may be blocking it, so try another relay in Settings.", true);
    }
    if (settings.transport === "epoxy") {
      await bareConn.setTransport(location.origin + BASE + "epoxy/index.mjs", [{ wisp: relay }]);
    } else {
      await bareConn.setTransport(location.origin + BASE + "libcurl/index.mjs", [{ websocket: relay }]);
    }
    relayInUse = relay;
    setRelayStatus("ok", `Connected through the ${RELAY_NAMES[relay] || hostOf(relay)} relay`);
  }

  async function setupProxy() {
    setRelayStatus("busy", "Starting the proxy…");
    if (!("serviceWorker" in navigator)) {
      setRelayStatus("bad", "Proxy unavailable in this browser");
      throw new ProxyError("This browser won't run the proxy here (service workers are off). Try a normal window instead of a private one, or another browser.");
    }
    if (typeof window.$scramjetLoadController !== "function" || !window.BareMux) {
      setRelayStatus("bad", "Proxy files didn't load");
      throw new ProxyError("The proxy files didn't load. Reload the page and try again.");
    }
    if (!scramjet) {
      const { ScramjetController } = window.$scramjetLoadController();
      scramjet = new ScramjetController({
        prefix: PROXY_PREFIX,
        files: {
          wasm: BASE + "scram/scramjet.wasm.wasm",
          all: BASE + "scram/scramjet.all.js",
          sync: BASE + "scram/scramjet.sync.js",
        },
      });
      await scramjet.init();
    }
    await navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE, updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    if (!bareConn) bareConn = new window.BareMux.BareMuxConnection(BASE + "baremux/worker.js");
    await connectRelay();
  }

  function initProxy() {
    if (!proxyReady) {
      proxyReady = setupProxy().catch((err) => {
        proxyReady = null;
        throw err;
      });
    }
    return proxyReady;
  }

  function toUrl(input) {
    const text = input.trim();
    try {
      const url = new URL(text);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch { /* not a full URL */ }
    try {
      const url = new URL("https://" + text);
      if (url.hostname.includes(".") && !/\s/.test(text)) return url.href;
    } catch { /* not a bare host either */ }
    return settings.engine.replace("%s", encodeURIComponent(text));
  }

  function openInProxy(url) {
    location.hash = "#/browse/" + encodeURIComponent(url);
  }

  // ------------------------------------------------------------------ browser

  let browsing = false;
  let sjFrame = null;
  let frameUrl = null;

  function progress(state) {
    const bar = $("#browserProgress");
    bar.classList.remove("run", "end");
    void bar.offsetWidth; // restart the transition
    bar.classList.add(state ? "run" : "end");
  }

  function showBrowserError(err) {
    const box = $("#browserError");
    $("#browserLoading").classList.add("done");
    progress(false);
    const message = err instanceof ProxyError ? err.message : "Something went wrong starting the proxy. Reload and try again.";
    box.innerHTML = `<div>
      <h4>The proxy couldn't start</h4>
      <p>${esc(message)}</p>
      <div class="row">
        <button class="btn primary" type="button" data-act="retry">Try again</button>
        <button class="btn" type="button" data-act="settings">Settings</button>
      </div>
    </div>`;
    box.hidden = false;
  }

  async function openBrowser(url) {
    const first = !browsing;
    browsing = true;
    $("#browser").hidden = false;
    document.body.style.overflow = "hidden";
    if (document.activeElement !== $("#address")) $("#address").value = url;
    if (!first && url === frameUrl) return;

    $("#browserError").hidden = true;
    if (!sjFrame) {
      $("#browserLoading").classList.remove("done");
      $("#browserLoadingText").textContent = "Starting the proxy…";
    }
    progress(true);

    try {
      await initProxy();
    } catch (err) {
      if (browsing) showBrowserError(err);
      return;
    }
    if (!browsing) return;

    if (!sjFrame) {
      sjFrame = scramjet.createFrame();
      const f = sjFrame.frame;
      f.title = "BrickyProcky proxy";
      f.allow = "autoplay; fullscreen; clipboard-read; clipboard-write; camera; microphone; display-capture; gamepad; pointer-lock; picture-in-picture; screen-wake-lock; web-share";
      f.allowFullscreen = true;
      $("#browserStage").append(f);
      sjFrame.addEventListener("urlchange", (e) => onFrameUrl(e.url));
      f.addEventListener("load", () => {
        $("#browserLoading").classList.add("done");
        progress(false);
        try {
          const title = f.contentDocument?.title;
          if (title && browsing) document.title = `${title} · BrickyProcky`;
        } catch { /* cross-origin error pages */ }
      });
    }
    $("#browserLoadingText").textContent = `Opening ${hostOf(url)}…`;
    frameUrl = url;
    sjFrame.go(url);
  }

  function onFrameUrl(url) {
    if (!browsing || !url) return;
    frameUrl = String(url);
    if (document.activeElement !== $("#address")) $("#address").value = frameUrl;
    history.replaceState(null, "", "#/browse/" + encodeURIComponent(frameUrl));
    lastHash = location.hash;
    document.title = `${hostOf(frameUrl)} · BrickyProcky`;
  }

  function closeBrowser() {
    if (!browsing) return;
    browsing = false;
    frameUrl = null;
    if (sjFrame) {
      sjFrame.frame.remove();
      sjFrame = null;
    }
    $("#browser").hidden = true;
    $("#browserLoading").classList.remove("done");
    document.body.style.overflow = "";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (currentView === "proxy") document.title = "Proxy · BrickyProcky";
  }

  // ------------------------------------------------------------------ settings

  function openSettings() {
    $("#setRelay").value = settings.relay;
    $("#setRelayCustom").value = settings.relayCustom;
    $("#relayCustomField").hidden = settings.relay !== "custom";
    $("#setTransport").value = settings.transport;
    $("#setEngine").value = settings.engine;
    $("#settings").showModal();
  }

  async function saveSettings() {
    const next = {
      relay: $("#setRelay").value,
      relayCustom: $("#setRelayCustom").value.trim(),
      transport: $("#setTransport").value,
      engine: $("#setEngine").value,
    };
    if (next.relay === "custom" && !/^wss?:\/\//.test(next.relayCustom)) {
      toast("A custom relay needs a wss:// address.");
      next.relay = settings.relay;
    }
    const relayChanged = next.relay !== settings.relay || next.relayCustom !== settings.relayCustom || next.transport !== settings.transport;
    Object.assign(settings, next);
    store.set("settings", settings);
    toast("Settings saved");
    if (relayChanged && bareConn) {
      try {
        await connectRelay();
        if (sjFrame && browsing) sjFrame.reload();
      } catch {
        toast("Couldn't reach that relay.");
      }
    }
  }

  async function resetProxy() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((r) => r.unregister()));
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase("$scramjet");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    } catch { /* best effort */ }
    location.replace(BASE + "#/proxy");
    location.reload();
  }

  // ------------------------------------------------------------------ events

  function bindEvents() {
    window.addEventListener("hashchange", route);
    window.addEventListener("resize", moveGlider);
    document.fonts?.ready.then(moveGlider);

    document.addEventListener("click", (e) => {
      const fav = e.target.closest("[data-fav]");
      if (fav) {
        e.preventDefault();
        e.stopPropagation();
        toggleFav(fav.dataset.fav);
        return;
      }
      const app = e.target.closest(".app[data-url]");
      if (app) {
        openInProxy(app.dataset.url);
        return;
      }
      const chip = e.target.closest("[data-chip]");
      if (chip) {
        activeChip = chip.dataset.chip;
        updateChips();
        applyFilter();
        chip.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    });

    for (const choice of $$(".choice")) {
      choice.addEventListener("pointermove", (e) => {
        const r = choice.getBoundingClientRect();
        choice.style.setProperty("--mx", `${e.clientX - r.left}px`);
        choice.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    }

    const search = $("#gameSearch");
    search.addEventListener("input", () => {
      query = search.value;
      applyFilter();
    });
    $("#clearSearch").addEventListener("click", () => {
      search.value = query = "";
      activeChip = "all";
      updateChips();
      applyFilter();
    });

    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if (e.key === "/" && !typing && currentView === "games" && !playingId) {
        e.preventDefault();
        search.focus();
      }
      if (e.key === "Escape" && !typing && !document.fullscreenElement) {
        if (playingId) leave(playerCameFrom, "#/games");
        else if (browsing) leave(browserCameFrom, "#/proxy");
      }
    });

    $("#player").addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "close") leave(playerCameFrom, "#/games");
      if (act === "fav" && playingId) toggleFav(playingId);
      if (act === "full") fullscreen($("#playerStage"));
      if (act === "reload" && playingId) mountGame(byId.get(playingId));
    });

    $("#browser").addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "close" || act === "home") leave(browserCameFrom, "#/proxy");
      if (act === "full") fullscreen($("#browserStage"));
      if (act === "settings") openSettings();
      if (act === "retry") {
        const url = frameUrl || $("#address").value;
        frameUrl = null;
        openBrowser(url);
      }
      if (!sjFrame) return;
      if (act === "back") sjFrame.back();
      if (act === "forward") sjFrame.forward();
      if (act === "reload") {
        progress(true);
        sjFrame.reload();
      }
    });

    $("#omni").addEventListener("submit", (e) => {
      e.preventDefault();
      const value = $("#omniInput").value;
      if (value.trim()) openInProxy(toUrl(value));
    });

    $("#addressForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#address");
      if (!input.value.trim()) return;
      const url = toUrl(input.value);
      input.blur();
      if (sjFrame) {
        progress(true);
        frameUrl = url;
        sjFrame.go(url);
      } else {
        openBrowser(url);
      }
    });
    $("#address").addEventListener("focus", (e) => e.target.select());

    $("#settingsBtn").addEventListener("click", openSettings);
    $("#setRelay").addEventListener("change", (e) => {
      $("#relayCustomField").hidden = e.target.value !== "custom";
    });
    $("#settings").addEventListener("close", () => {
      if ($("#settings").returnValue === "save") saveSettings();
    });
    $("#resetProxy").addEventListener("click", resetProxy);
  }

  // ------------------------------------------------------------------ start

  renderApps();
  bindEvents();
  loadCatalog().catch(() => {});
  route();
})();
