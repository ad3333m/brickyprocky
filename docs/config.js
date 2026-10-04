// BrickyProcky front-end config.
// - api:       where the auth functions live. "/api" works when the site is
//              served by Cloudflare Pages (same origin).
// - secureUrl: the secure Cloudflare URL. Set this once you've deployed so the
//              old GitHub Pages copy can point people to the locked site, e.g.
//              "https://brickyprocky.pages.dev/". Leave "" to disable.
window.BP_CONFIG = {
  api: "/api",
  secureUrl: "https://brickyprocky.pages.dev/",
};
