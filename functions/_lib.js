// Shared helpers for the BrickyProcky lock (Cloudflare Pages Functions).
// Underscore-prefixed, so it's not a route — only imported by the others.

const enc = new TextEncoder();

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers || {}) },
  });
}

function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

// A tiny signed token: base64url(payload) "." base64url(HMAC-SHA256(payload)).
export async function sign(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return body + "." + b64url(sig);
}

export async function verify(secret, token) {
  if (!secret || !token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const expected = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  if (!timingSafeEqual(b64url(expected), sig)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromB64url(body))); } catch { return null; }
  if (!payload || (payload.exp && Date.now() > payload.exp)) return null;
  return payload;
}

export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const m = header.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function timingSafeEqual(a, b) {
  const ab = enc.encode(String(a));
  const bb = enc.encode(String(b));
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

export function newCode() {
  const r = new Uint32Array(1);
  crypto.getRandomValues(r);
  return String(r[0] % 10000).padStart(4, "0"); // random 4-digit code
}

// A fresh set of n unique visitor codes, none equal to the owner passcode.
export function freshCodes(n, ownerCode) {
  const owner = String(ownerCode || "").trim();
  const seen = new Set();
  const list = [];
  while (list.length < n) {
    const code = newCode();
    if (code === owner || seen.has(code)) continue;
    seen.add(code);
    list.push({ code, used: false, created: Date.now() });
  }
  return list;
}

// Visitor codes are kept in one KV value, not one key each: KV list() is only
// eventually consistent, so freshly written keys don't show up right away. A
// single value we read and write whole avoids that.
export async function getCodes(env) {
  try { return JSON.parse(await env.LOCK.get("codes")) || []; } catch { return []; }
}
export async function putCodes(env, codes) {
  await env.LOCK.put("codes", JSON.stringify(codes));
}

const SESSION_MS = 12 * 3600 * 1000; // token lifetime backstop
export function sessionExpiry() { return Date.now() + SESSION_MS; }

// bp_session (the gate) is HttpOnly so scripts can't read it. bp_role is readable
// so the app can show the owner tools. Both are session cookies (no Max-Age): they
// die when the browser closes. A refresh keeps the session — the app re-shows the
// lock itself (see bp_fresh) and re-checks the code without using up a visitor code.
export function setSessionCookies(res, token, role) {
  const base = "Path=/; SameSite=Lax; Secure";
  res.headers.append("set-cookie", `bp_session=${token}; HttpOnly; ${base}`);
  res.headers.append("set-cookie", `bp_role=${role}; ${base}`);
}
// One-shot marker: the page opened right after entering the code reads it once and
// deletes it, so it doesn't ask again immediately — but the next refresh will.
export function setFreshCookie(res) {
  res.headers.append("set-cookie", "bp_fresh=1; Path=/; Max-Age=60; SameSite=Lax; Secure");
}
export function clearSessionCookies(res) {
  const base = "Path=/; Max-Age=0; SameSite=Lax; Secure";
  res.headers.append("set-cookie", `bp_session=; HttpOnly; ${base}`);
  res.headers.append("set-cookie", `bp_role=; ${base}`);
}

export async function session(context) {
  return verify(context.env.SESSION_SECRET, getCookie(context.request, "bp_session"));
}
