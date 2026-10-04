// Visitor codes, owner only. Stored as one KV value (see _lib getCodes/putCodes).
//   GET  /api/codes            -> { codes: [{ code, used, usedAt, created }] }
//                                 (seeds 20 the first time)
//   POST /api/codes { count }  -> generates N more (default 10, max 50)

import { json, session, newCode, getCodes, putCodes } from "../_lib.js";

async function requireOwner(context) {
  const s = await session(context);
  return s && s.r === "owner" ? s : null;
}

function addCodes(codes, n) {
  const made = [];
  for (let i = 0; i < n; i++) {
    const code = newCode();
    codes.push({ code, used: false, created: Date.now() });
    made.push(code);
  }
  return made;
}

export async function onRequestGet(context) {
  if (!(await requireOwner(context))) return json({ error: "forbidden" }, { status: 403 });
  const codes = await getCodes(context.env);
  if (!codes.length) {
    addCodes(codes, 20);
    await putCodes(context.env, codes);
  }
  return json({ codes });
}

export async function onRequestPost(context) {
  if (!(await requireOwner(context))) return json({ error: "forbidden" }, { status: 403 });
  let body;
  try { body = await context.request.json(); } catch { body = {}; }
  const count = Math.min(Math.max(parseInt(body.count, 10) || 10, 1), 50);
  const codes = await getCodes(context.env);
  const added = addCodes(codes, count);
  await putCodes(context.env, codes);
  return json({ added, codes });
}
