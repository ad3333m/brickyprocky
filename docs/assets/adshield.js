// BrickyProcky ad shield. Loaded by play.html before any game code runs.
//
// - Requests to ad and tracking servers fail, the way a browser ad blocker
//   makes them fail, so game SDKs give up on the ad and carry on.
// - Pop-up windows are refused.
// - The "Close (12)" banner that many uploads carry (#ad-container around an
//   Apps Script frame) is switched off before the game document is written.
//
// The hooks live on the window and on element prototypes, which survive the
// document.open() that play.html uses to swap in the game.
(() => {
  "use strict";

  // Hostnames (and their subdomains) that only ever serve ads or tracking.
  const AD_HOSTS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
    "google-analytics.com", "googletagmanager.com", "googletagservices.com", "imasdk.googleapis.com",
    "fundingchoicesmessages.google.com", "static.cloudflareinsights.com",
    "amazon-adsystem.com", "adnxs.com", "adsrvr.org", "pubmatic.com", "rubiconproject.com", "openx.net",
    "casalemedia.com", "criteo.com", "criteo.net", "taboola.com", "outbrain.com", "sharethrough.com",
    "33across.com", "media.net", "adform.net", "smartadserver.com", "moatads.com", "2mdn.net",
    "scorecardresearch.com", "quantserve.com", "adinplay.com", "venatus.com", "venatusmedia.com",
    "cpmstar.com", "adsterra.com", "propellerads.com", "popads.net", "popcash.net", "hilltopads.net",
    "a-ads.com", "adcash.com", "exoclick.com", "juicyads.com", "mgid.com", "revcontent.com",
    "an.yandex.ru", "mc.yandex.ru", "adfox.ru", "clickadu.com", "admaven.com",
  ];
  // Only blocked as frames: inside a game, an Apps Script frame is always the
  // uploader's banner, never the game itself.
  const AD_FRAME_PREFIXES = ["https://script.google.com/macros/"];

  const dead = URL.createObjectURL(new Blob([]));
  URL.revokeObjectURL(dead); // a URL that fails to load, like a blocked request

  function hostBlocked(raw) {
    let url;
    try { url = new URL(raw, location.href); } catch { return false; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return AD_HOSTS.some((h) => host === h || host.endsWith("." + h)) || /(^|\.)yandex\.ru$/.test(host) && url.pathname.startsWith("/ads");
  }
  const frameBlocked = (raw) => hostBlocked(raw) || AD_FRAME_PREFIXES.some((p) => String(raw).startsWith(p));

  let blockedCount = 0;
  const note = () => { blockedCount++; };

  // ---- network

  const realFetch = window.fetch;
  window.fetch = function (input) {
    const url = typeof input === "string" ? input : input && input.url;
    if (url && hostBlocked(url)) { note(); return realFetch.call(window, dead); }
    return realFetch.apply(window, arguments);
  };

  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (hostBlocked(url)) {
      note();
      const args = Array.prototype.slice.call(arguments);
      args[1] = dead;
      return realOpen.apply(this, args);
    }
    return realOpen.apply(this, arguments);
  };

  if (navigator.sendBeacon) {
    const realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => (hostBlocked(url) ? (note(), true) : realBeacon(url, data));
  }

  window.open = function () { note(); return null; };

  // ---- elements that load things

  function guard(proto, prop, isBlocked, replacement) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(value) {
        if (isBlocked(value)) { note(); this.setAttribute("data-bp-blocked", ""); return desc.set.call(this, replacement); }
        return desc.set.call(this, value);
      },
    });
  }
  guard(HTMLScriptElement.prototype, "src", hostBlocked, dead);
  guard(HTMLImageElement.prototype, "src", hostBlocked, dead);
  guard(HTMLIFrameElement.prototype, "src", frameBlocked, "about:blank");

  const realSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (String(name).toLowerCase() === "src") {
      const tag = this.tagName;
      if (tag === "IFRAME" && frameBlocked(value)) { note(); realSetAttribute.call(this, "data-bp-blocked", ""); return realSetAttribute.call(this, name, "about:blank"); }
      if ((tag === "SCRIPT" || tag === "IMG") && hostBlocked(value)) { note(); realSetAttribute.call(this, "data-bp-blocked", ""); return realSetAttribute.call(this, name, dead); }
    }
    return realSetAttribute.apply(this, arguments);
  };

  // ---- markup (the game document itself, and anything it document.write()s)

  function clean(html) {
    return String(html)
      .replace(/(<iframe\b[^>]*\bsrc\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, src) =>
        frameBlocked(src) ? (note(), `${pre}${q}about:blank${q} data-bp-blocked`) : m)
      .replace(/(<script\b[^>]*\bsrc\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, src) =>
        hostBlocked(src) ? (note(), `${pre}${q}${dead}${q} data-bp-blocked`) : m);
  }

  for (const name of ["write", "writeln"]) {
    const real = Document.prototype[name];
    Document.prototype[name] = function (...parts) {
      return real.apply(this, parts.map(clean));
    };
  }

  // ---- leftovers added later by innerHTML and friends

  const HIDE = [
    "#ad-container", "#ad-iframe", "#close-ad", "#ad-right-mask",
    "ins.adsbygoogle", ".adsbygoogle", "[id^='google_ads_iframe']", "[id^='div-gpt-ad']",
    "iframe[data-bp-blocked]", "img[data-bp-blocked]",
  ].join(",");

  function sweep(root) {
    if (!root.querySelectorAll) return;
    for (const frame of root.querySelectorAll("iframe[src]")) {
      if (!frame.hasAttribute("data-bp-blocked") && frameBlocked(frame.getAttribute("src"))) {
        note();
        realSetAttribute.call(frame, "data-bp-blocked", "");
        realSetAttribute.call(frame, "src", "about:blank");
      }
    }
  }

  // Called by play.html once the game document has been written.
  function watch() {
    const style = document.createElement("style");
    style.textContent = `${HIDE}{display:none!important}`;
    (document.head || document.documentElement).appendChild(style);
    sweep(document);
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) sweep(n.parentNode || n);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  Object.defineProperty(window, "BrickyShield", {
    value: Object.freeze({ clean, watch, get blocked() { return blockedCount; } }),
  });
})();
