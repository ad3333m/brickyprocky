// Visitor codes, owner only. Stored in D1 (see _lib). Ten random 4-digit codes;
// "refresh" replaces the whole set with new ones.
//   GET  /api/codes  -> { codes: [{ code, used, usedAt, created }] }  (seeds 10)
//   POST /api/codes  -> replaces all codes with 10 fresh ones

import { json, session, freshCodes, listCodes, replaceCodes, seedIfEmpty } from "../_lib.js";

async function requireOwner(context) {
  const s = await session(context);
  return s && s.r === "owner" ? s : null;
}

export async function onRequestGet(context) {
  if (!(await requireOwner(context))) return json({ error: "forbidden" }, { status: 403 });
  await seedIfEmpty(context.env, context.env.OWNER_PASSCODE);
  return json({ codes: await listCodes(context.env) });
}

export async function onRequestPost(context) {
  if (!(await requireOwner(context))) return json({ error: "forbidden" }, { status: 403 });
  const codes = freshCodes(10, context.env.OWNER_PASSCODE);
  await replaceCodes(context.env, codes);
  return json({ codes });
}
