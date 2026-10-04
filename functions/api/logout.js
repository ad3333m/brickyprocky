// POST /api/logout -> clears the session cookies.

import { json, clearSessionCookies } from "../_lib.js";

export async function onRequestPost() {
  const res = json({ ok: true });
  clearSessionCookies(res);
  return res;
}
