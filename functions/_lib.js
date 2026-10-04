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

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L ambiguity
export function newCode() {
  const r = new Uint32Array(6);
  crypto.getRandomValues(r);
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[r[i] % ALPHABET.length];
  return s;
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

const SESSION_MS = 30 * 24 * 3600 * 1000;
export function sessionExpiry() { return Date.now() + SESSION_MS; }

export function setSessionCookies(res, token, role) {
  const base = `Path=/; Max-Age=${SESSION_MS / 1000}; SameSite=Lax; Secure`;
  res.headers.append("set-cookie", `bp_session=${token}; HttpOnly; ${base}`);
  // Readable by the app so it knows the role and skips the in-app lock. Not a
  // security boundary — access is already gated by the HttpOnly session cookie.
  res.headers.append("set-cookie", `bp_role=${role}; ${base}`);
}
export function clearSessionCookies(res) {
  const base = "Path=/; Max-Age=0; SameSite=Lax; Secure";
  res.headers.append("set-cookie", `bp_session=; HttpOnly; ${base}`);
  res.headers.append("set-cookie", `bp_role=; ${base}`);
}

export async function session(context) {
  return verify(context.env.SESSION_SECRET, getCookie(context.request, "bp_session"));
}
