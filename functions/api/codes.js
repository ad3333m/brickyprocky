// Visitor codes, owner only.
//   GET  /api/codes            -> { codes: [{ code, used, usedAt, created }] }
//                                 (seeds 20 the first time)
//   POST /api/codes { count }  -> generates N more (default 10, max 50)

import { json, session, newCode } from "../_lib.js";

async function requireOwner(context) {
  const s = await session(context);
  return s && s.r === "owner" ? s : null;
}

async function listCodes(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.LOCK.list({ prefix: "vc:", cursor });
    for (const k of page.keys) {
      let rec = {};
      try { rec = JSON.parse(await env.LOCK.get(k.name)); } catch { /* skip */ }
      out.push({ code: k.name.slice(3), used: !!rec.used, usedAt: rec.usedAt || null, created: rec.created || 0 });
    }
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);
  out.sort((a, b) => a.created - b.created);
  return out;
}

async function makeCodes(env, n) {
  const made = [];
  for (let i = 0; i < n; i++) {
    const code = newCode();
    await env.LOCK.put("vc:" + code, JSON.stringify({ used: false, created: Date.now() }));
    made.push(code);
  }
  return made;
}

export async function onRequestGet(context) {
  if (!(await requireOwner(context))) return json({ error: "forbidden" }, { status: 403 });
  let codes = await listCodes(context.env);
  if (!codes.length) {
    await makeCodes(context.env, 20);
    codes = await listCodes(context.env);
  }
  return json({ codes });
}

export async function onRequestPost(context) {
  if (!(await requireOwner(context))) return json({ error: "forbidden" }, { status: 403 });
  let body;
  try { body = await context.request.json(); } catch { body = {}; }
  const count = Math.min(Math.max(parseInt(body.count, 10) || 10, 1), 50);
  const added = await makeCodes(context.env, count);
  return json({ added, codes: await listCodes(context.env) });
}
