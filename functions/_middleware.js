// Edge gate: the app is only served to a valid signed session. Everyone else
// gets a standalone lock page (for navigations) or 401 (for assets), so the
// games/proxy files are never delivered to someone who hasn't entered a code.

import { session } from "./_lib.js";

export async function onRequest(context) {
  const { request, next } = context;
  const path = new URL(request.url).pathname;

  // The auth endpoints handle their own checks.
  if (path.startsWith("/api/")) return next();

  if (await session(context)) {
    // Never let the browser cache the HTML, or a refresh after the session is
    // cleared would serve a stale (logged-in) page from cache while its gated
    // assets 401 — the "unstyled page" bug. Assets can still cache normally.
    const res = await next();
    if ((res.headers.get("content-type") || "").includes("text/html")) {
      const fresh = new Response(res.body, res);
      fresh.headers.set("cache-control", "no-store");
      return fresh;
    }
    return res;
  }

  const accept = request.headers.get("accept") || "";
  if (request.method === "GET" && accept.includes("text/html")) {
    return new Response(LOCK_PAGE, {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response("Locked", { status: 401 });
}

const LOCK_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>BrickyProcky</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 20px;
    font-family: "Outfit", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #f3f4ff;
    background:
      radial-gradient(1100px 700px at 50% -12%, rgba(88,60,200,.42), transparent 62%),
      radial-gradient(900px 600px at 50% 120%, rgba(14,116,144,.28), transparent 60%), #07071a;
  }
  .card {
    width: min(340px, 100%); padding: 34px 28px 26px; border-radius: 24px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    background: linear-gradient(180deg, rgba(255,255,255,.1), rgba(255,255,255,.045));
    border: 1px solid rgba(255,255,255,.11);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 18px 50px -22px rgba(0,0,0,.7);
    -webkit-backdrop-filter: blur(22px) saturate(165%); backdrop-filter: blur(22px) saturate(165%);
  }
  .mark { width: 54px; height: 54px; border-radius: 15px; filter: drop-shadow(0 12px 28px rgba(124,58,237,.6)); }
  h1 { margin: 2px 0 0; font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
  p { margin: 0; color: rgba(226,229,255,.66); font-size: 14px; }
  form { display: flex; flex-direction: column; gap: 10px; width: 100%; margin-top: 8px; }
  input {
    height: 50px; padding: 0 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,.11);
    background: rgba(0,0,0,.3); color: #f3f4ff; text-align: center; letter-spacing: .4em; font-size: 22px; outline: 0;
  }
  input:focus { border-color: rgba(139,92,246,.7); }
  button {
    height: 46px; border: 1px solid rgba(255,255,255,.22); border-radius: 14px; cursor: pointer;
    font: 600 15px/1 inherit; color: #fff;
    background: linear-gradient(135deg, #9b7bff 0%, #7c3aed 45%, #22d3ee 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 12px 30px -10px rgba(124,58,237,.85);
  }
  .err { min-height: 16px; margin: 0; color: #fca5a5; font-size: 13px; font-weight: 500; }
  .shake { animation: shake .4s; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-9px)} 40%{transform:translateX(9px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
</style>
</head>
<body>
  <div class="card" id="card">
    <img class="mark" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23b69cff'/%3E%3Cstop offset='.5' stop-color='%237c3aed'/%3E%3Cstop offset='1' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='2' y='2' width='60' height='60' rx='18' fill='url(%23g)'/%3E%3Cg fill='%23fff'%3E%3Crect x='12' y='16' width='19' height='8.5' rx='2.6'/%3E%3Crect x='33' y='16' width='19' height='8.5' rx='2.6' opacity='.68'/%3E%3Crect x='22.5' y='27.75' width='19' height='8.5' rx='2.6'/%3E%3Crect x='33' y='39.5' width='19' height='8.5' rx='2.6'/%3E%3C/g%3E%3C/svg%3E" alt="" />
    <h1>BrickyProcky</h1>
    <p>Enter your passcode</p>
    <form id="f" autocomplete="off">
      <input id="c" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="••••" aria-label="Passcode" />
      <button type="submit">Unlock</button>
    </form>
    <p class="err" id="e" role="alert"></p>
  </div>
<script>
  var f = document.getElementById("f"), c = document.getElementById("c"), e = document.getElementById("e"), card = document.getElementById("card");
  c.focus();
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    e.textContent = "";
    fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c.value }) })
      .then(function (r) {
        if (r.ok) { location.reload(); return; }
        e.textContent = r.status === 429 ? "Too many tries — wait a minute." : "Incorrect passcode";
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); c.select();
      })
      .catch(function () { e.textContent = "Network error — try again."; });
  });
</script>
</body>
</html>`;
