// BrickyProcky service worker: hands proxied requests (everything under go/)
// to Scramjet and leaves the rest of the site alone.
importScripts("scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const BASE = new URL("./", self.location).pathname;
const PROXIED = [self.location.origin + BASE + "go/", self.location.origin + BASE + "scram/scramjet.wasm.wasm"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function proxied(event) {
  await scramjet.loadConfig();
  if (scramjet.route(event)) return scramjet.fetch(event);
  return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (PROXIED.some((prefix) => url.startsWith(prefix))) event.respondWith(proxied(event));
});
