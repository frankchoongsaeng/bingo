// Standalone server for Realtime Bingo.
//
// One Express process serves everything:
//   - `/api/bingo/*`  → the in-memory game engine + Server-Sent Events stream
//     (mounted first so it always wins over the SPA fallback).
//   - everything else → the React single-page app. In development that's Vite
//     in middleware mode (HMR); in production it's the built `dist/` folder.
//
// The bingo router is deliberately mounted before any HTML fallback so the SSE
// stream is never intercepted or buffered.

import express from "express";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBingoRouter } from "./server/bingo.js";

const mode = process.env.NODE_ENV ?? "development";
const port = Number(process.env.PORT ?? 3000);
const app = express();

app.use("/api/bingo", createBingoRouter());

if (mode !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa", // adds the HTML transform + SPA fallback middlewares
  });
  app.use(vite.middlewares);
} else {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.join(dir, "dist");
  app.use(express.static(dist));
  // SPA fallback: any non-asset, non-API route serves the app shell.
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// Pick the first non-internal IPv4 address so friends on the same network can
// join without hunting for the host machine's LAN IP.
function networkAddress() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

app.listen(port, () => {
  const lan = networkAddress();
  console.log(`\n  ➜  Local:    http://localhost:${port}`);
  if (lan) console.log(`  ➜  Network:  http://${lan}:${port}`);
  console.log("");
});
