# Secure lock — deploy on Cloudflare Pages

The passcode lock is only *secure* when the site is served by **Cloudflare Pages**,
because the gate runs on their servers (`functions/`) and only sends the app to a
logged-in visitor. GitHub Pages can't do that — it just serves files — so the
github.io copy stays locked with no way in; use the Cloudflare URL as the real site.

Your **owner passcode** is the 4-digit code shared with you privately (set it as the
`OWNER_PASSCODE` secret below). It lives only in a server secret, never in the page or
this repo. Keep it private; anyone with it can manage visitor codes.

## One-time setup (Cloudflare dashboard — no command line needed)

1. Make a free account at <https://dash.cloudflare.com> and open **Workers & Pages**.
2. **Create application → Pages → Connect to Git**, and pick the `ad3333m/brickyprocky` repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`docs`**
   - Click **Save and Deploy**. Name the project **`brickyprocky`** so the URL is
     `https://brickyprocky.pages.dev` (if you pick another name, note the URL).
4. Create the storage the codes live in: **Workers & Pages → KV → Create a namespace**,
   name it `brickyprocky-lock`.
5. Bind it + add the secrets: open your Pages project → **Settings → Functions**
   (or **Bindings**):
   - **KV namespace bindings** → add: Variable name **`LOCK`** → your `brickyprocky-lock` namespace.
   - **Environment variables** (Production) → add two, and tick **Encrypt** on each:
     - `OWNER_PASSCODE` = your 4-digit owner code (the one shared with you privately)
     - `SESSION_SECRET` = a long random string (e.g. run
       `python -c "import secrets;print(secrets.token_hex(32))"`, or mash the keyboard — 40+ chars)
6. **Deployments → Retry deployment** (or push any commit) so the new bindings take effect.

Open `https://brickyprocky.pages.dev` → you should get the passcode screen. Enter
your owner code to get in as owner; **Settings → Visitor codes** shows 20 one-time codes with
an **Add 10 codes** button. Hand a code to a friend on *any device* — it works once,
then shows as used for everyone.

## Point the old GitHub Pages link at the secure site (optional)

Edit [`docs/config.js`](docs/config.js) and set `secureUrl` to your Pages URL, e.g.
`secureUrl: "https://brickyprocky.pages.dev/"`, then commit/push. Now the github.io
lock screen shows a **Go to the secure site** button.

## Command-line alternative (Wrangler)

```
npm i -g wrangler
wrangler login
wrangler kv namespace create brickyprocky-lock      # note the id it prints
wrangler pages project create brickyprocky --production-branch main
# add the KV binding + secrets in the dashboard (Settings), or via wrangler.toml, then:
wrangler pages deploy docs
```

## How it works

- `functions/_middleware.js` runs at the edge on every request. No valid session →
  it returns a standalone lock page for page loads, `401` for everything else, so the
  games/proxy files are never delivered to someone who hasn't entered a code.
- `functions/api/auth.js` checks the code: the owner passcode (`OWNER_PASSCODE`
  secret) or an unused one-time visitor code in KV. On success it sets a **signed,
  HttpOnly** session cookie (signed with `SESSION_SECRET`), so it can't be forged or
  read by scripts. Brute force is rate-limited per IP.
- `functions/api/codes.js` (owner only) lists and generates visitor codes in KV, which
  is shared across all devices — that's why one-time use is enforced everywhere, not
  just per browser.
