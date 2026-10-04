// GET /api/me -> { role } for the current session, or 401.

import { json, session } from "../_lib.js";

export async function onRequestGet(context) {
  const s = await session(context);
  if (!s) return json({ role: null }, { status: 401 });
  return json({ role: s.r });
}
