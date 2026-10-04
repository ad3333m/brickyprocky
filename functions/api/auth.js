// POST /api/auth  { code }
// Owner passcode (server secret) or an unused one-time visitor code grants a
// signed session cookie. Rate-limited per IP to blunt brute force.

import { json, sign, timingSafeEqual, setSessionCookies, setFreshCookie, sessionExpiry, getCodes, putCodes } from "../_lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SESSION_SECRET || !env.OWNER_PASSCODE || !env.LOCK) {
    return json({ error: "not_configured" }, { status: 500 });
  }

  const ip = request.headers.get("cf-connecting-ip") || "anon";
  const rlKey = "rl:" + ip;
  const tries = parseInt((await env.LOCK.get(rlKey)) || "0", 10);
  if (tries >= 12) return json({ error: "too_many" }, { status: 429 });
  await env.LOCK.put(rlKey, String(tries + 1), { expirationTtl: 60 });

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return json({ error: "bad_request" }, { status: 400 });

  let role = null;
  if (timingSafeEqual(code, String(env.OWNER_PASSCODE).trim().toUpperCase())) {
    role = "owner";
  } else {
    const codes = await getCodes(env);
    const hit = codes.find((c) => c.code === code && !c.used);
    if (hit) {
      hit.used = true;
      hit.usedAt = Date.now();
      await putCodes(env, codes);
      role = "visitor";
    }
  }

  if (!role) return json({ error: "invalid" }, { status: 401 });

  // Remember the visitor's code in the (signed) token so a refresh can re-check it
  // without spending another one-time code. The owner is re-checked against the secret.
  const payload = { r: role, exp: sessionExpiry() };
  if (role === "visitor") payload.c = code;
  const token = await sign(env.SESSION_SECRET, payload);
  const res = json({ ok: true, role });
  setSessionCookies(res, token, role);
  setFreshCookie(res);
  return res;
}
