// Local preview of docs/ under /brickyprocky/, the same path GitHub Pages uses.
// Usage: node tools/serve.js [port]   then open http://localhost:8080/brickyprocky/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const MOUNT = "/brickyprocky/";
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      res.writeHead(302, { location: MOUNT });
      return res.end();
    }
    if (!url.pathname.startsWith(MOUNT)) {
      res.writeHead(404);
      return res.end("not found");
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname.slice(MOUNT.length)));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("not found");
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
      res.end(body);
    });
  })
  .listen(PORT, () => console.log(`BrickyProcky preview: http://localhost:${PORT}${MOUNT}`));
