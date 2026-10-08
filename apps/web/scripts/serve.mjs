// Minimal static server for the production build, implementing scripts/hosting-rules.mjs.
// Used for local verification and Playwright; not a business backend.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./hosting-rules.mjs";

const root = fileURLToPath(new URL("../build/client", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".data": "text/x-script",
};

const exists = (path) => {
  const full = normalize(join(root, path));
  if (!full.startsWith(normalize(root))) return false;
  return existsSync(full) && statSync(full).isFile();
};

function send(res, status, path, extraHeaders = {}) {
  const full = join(root, path);
  const type = types[extname(full)] ?? "application/octet-stream";
  const immutable = path.startsWith("/assets/");
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    ...extraHeaders,
  });
  createReadStream(full).pipe(res);
}

createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url ?? "/", "http://localhost");
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  const decision = classify(url.pathname, exists);
  if (decision.kind === "file") return send(res, 200, decision.path);
  if (decision.kind === "spa") return send(res, 200, "/__spa-fallback.html", { "X-Robots-Tag": "noindex" });
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/assets/")) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  return send(res, 404, "/404/index.html", { "X-Robots-Tag": "noindex" });
}).listen(port, () => {
  console.log(`TrainFlow build served at http://localhost:${port}`);
});
