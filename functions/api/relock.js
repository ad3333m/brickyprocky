// POST /api/relock  { code }
// Re-check the passcode on a refresh WITHOUT consuming a one-time visitor code.
// Only works when there's already a valid session; the code must match that
// session (the owner passcode, or the exact code the visitor came in with).

import { json, session, timingSafeEqual } from "../_lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const s = await session(context);
  if (!s) return json({ error: "no_session" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return json({ error: "bad_request" }, { status: 400 });

  let ok = false;
  if (s.r === "owner") ok = timingSafeEqual(code, String(env.OWNER_PASSCODE || "").trim().toUpperCase());
  else if (s.r === "visitor" && s.c) ok = timingSafeEqual(code, String(s.c).toUpperCase());

  return ok ? json({ ok: true, role: s.r }) : json({ error: "invalid" }, { status: 401 });
}
