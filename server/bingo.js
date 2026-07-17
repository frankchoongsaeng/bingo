// Real-time multiplayer bingo — in-memory game engine + Express router (SSE).
//
// This module is imported directly by `server.js` (outside the React Router /
// Vite bundle), so it is plain ES-module JavaScript rather than TypeScript.
// State lives in process memory: the app runs as a single Node process, so a
// `Map` of rooms is sufficient for a lobby-based party game. Nothing here is
// persisted — rooms evaporate when the process restarts, which is the right
// lifetime for an ephemeral game session.
//
// Classic 75-ball bingo:
//   - Each player gets a 5x5 card. Columns are B(1-15) I(16-30) N(31-45)
//     G(46-60) O(61-75); the centre square is a free space.
//   - Once the host starts, the server draws a fresh number on a timer and
//     pushes it to every connected client over Server-Sent Events.
//   - Cards auto-daub called numbers. The first player to hit "BINGO!" with a
//     genuinely complete pattern wins; the server validates every claim.
//
// The router is mounted before the compression middleware in `server.js` so
// the SSE stream is flushed immediately instead of being buffered.

import express from "express";
import { randomUUID, randomInt } from "node:crypto";

const COLUMN_RANGES = [
  [1, 15], // B
  [16, 30], // I
  [31, 45], // N
  [46, 60], // G
  [61, 75], // O
];

const DEFAULT_CALL_INTERVAL_MS = 3500;
const MIN_CALL_INTERVAL_MS = 1500;
const MAX_CALL_INTERVAL_MS = 8000;
const SSE_KEEPALIVE_MS = 25000;
// Rooms with no connected players are swept after this long so abandoned
// lobbies don't leak memory.
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const MAX_PLAYERS = 24;
const MAX_NAME_LEN = 24;

/** @type {Map<string, Room>} */
const rooms = new Map();

// ── Helpers ────────────────────────────────────────────────────────────────

/** Fisher–Yates shuffle over a copy of `arr`, using a CSPRNG. */
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build a 5x5 bingo card as a flat array of 25 cells (row-major). 0 = free. */
function makeCard() {
  const cells = new Array(25);
  for (let col = 0; col < 5; col++) {
    const [lo, hi] = COLUMN_RANGES[col];
    const pool = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    const picks = shuffled(pool).slice(0, 5);
    for (let row = 0; row < 5; row++) {
      cells[row * 5 + col] = picks[row];
    }
  }
  cells[12] = 0; // centre free space
  return cells;
}

// All 12 winning lines (5 rows + 5 columns + 2 diagonals) as cell indices.
const WIN_LINES = (() => {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

/**
 * Given a card and the set of called numbers, return the winning pattern the
 * card satisfies, or null. The free centre square always counts as marked.
 *
 * @param {number[]} card
 * @param {Set<number>} called
 * @param {"line"|"blackout"} pattern
 * @returns {{ kind: "line", cells: number[] } | { kind: "blackout", cells: number[] } | null}
 */
function findWin(card, called, pattern) {
  const isMarked = (idx) => card[idx] === 0 || called.has(card[idx]);
  if (pattern === "blackout") {
    const all = card.every((n) => n === 0 || called.has(n));
    if (all) return { kind: "blackout", cells: card.map((_, i) => i) };
    return null;
  }
  for (const line of WIN_LINES) {
    if (line.every(isMarked)) return { kind: "line", cells: line };
  }
  return null;
}

function sanitizeName(raw, fallback) {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return fallback;
  return s.slice(0, MAX_NAME_LEN);
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
function makeRoomCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 5; i++) code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

// ── Room model ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} token
 * @property {string} name
 * @property {number[]} card
 * @property {boolean} isHost
 * @property {boolean} won
 * @property {import("express").Response|null} sse
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {"lobby"|"playing"|"finished"} phase
 * @property {string} hostPlayerId
 * @property {"line"|"blackout"} winPattern
 * @property {number} callIntervalMs
 * @property {Map<string, Player>} players
 * @property {number[]} calledNumbers
 * @property {Set<number>} calledSet
 * @property {string|null} winnerId
 * @property {number[]|null} winningLine
 * @property {NodeJS.Timeout|null} callTimer
 * @property {number|null} emptySince
 */

function createRoom({ winPattern, callIntervalMs }) {
  const id = makeRoomCode();
  /** @type {Room} */
  const room = {
    id,
    phase: "lobby",
    hostPlayerId: "",
    winPattern: winPattern === "blackout" ? "blackout" : "line",
    callIntervalMs: clampInterval(callIntervalMs),
    players: new Map(),
    calledNumbers: [],
    calledSet: new Set(),
    winnerId: null,
    winningLine: null,
    callTimer: null,
    emptySince: null,
  };
  rooms.set(id, room);
  return room;
}

function clampInterval(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return DEFAULT_CALL_INTERVAL_MS;
  return Math.min(MAX_CALL_INTERVAL_MS, Math.max(MIN_CALL_INTERVAL_MS, Math.round(n)));
}

function addPlayer(room, name, isHost) {
  const id = randomUUID();
  /** @type {Player} */
  const player = {
    id,
    token: randomUUID(),
    name,
    card: makeCard(),
    isHost,
    won: false,
    sse: null,
  };
  room.players.set(id, player);
  if (isHost) room.hostPlayerId = id;
  room.emptySince = null;
  return player;
}

// ── Serialization ────────────────────────────────────────────────────────────

/** Public room state — safe to broadcast to everyone (no cards, no tokens). */
function publicState(room) {
  const winner = room.winnerId ? room.players.get(room.winnerId) : null;
  return {
    id: room.id,
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    winPattern: room.winPattern,
    callIntervalMs: room.callIntervalMs,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.sse !== null,
      won: p.won,
    })),
    calledNumbers: room.calledNumbers,
    currentNumber: room.calledNumbers.length ? room.calledNumbers[room.calledNumbers.length - 1] : null,
    callsRemaining: 75 - room.calledNumbers.length,
    winnerId: room.winnerId,
    winnerName: winner ? winner.name : null,
    winningLine: room.winningLine,
  };
}

/** The private slice for one player (their card + identity). */
function selfState(player) {
  return { id: player.id, name: player.name, card: player.card, isHost: player.isHost, won: player.won };
}

// ── SSE broadcast ────────────────────────────────────────────────────────────

function sendEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === "function") res.flush();
  } catch {
    // Broken pipe — the connection cleanup handler will remove it.
  }
}

function broadcastState(room) {
  const state = publicState(room);
  for (const p of room.players.values()) {
    if (p.sse) sendEvent(p.sse, "state", state);
  }
}

// ── Number calling ───────────────────────────────────────────────────────────

function startCalling(room) {
  if (room.callTimer) return;
  const remaining = shuffled(
    Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !room.calledSet.has(n)),
  );
  const tick = () => {
    if (room.phase !== "playing") return stopCalling(room);
    const next = remaining.pop();
    if (next === undefined) {
      // Every ball drawn with no winner — the round is a draw.
      finishRoom(room, null, null);
      return;
    }
    room.calledNumbers.push(next);
    room.calledSet.add(next);
    broadcastState(room);
  };
  room.callTimer = setInterval(tick, room.callIntervalMs);
  // Draw the first ball immediately so the game feels responsive.
  tick();
}

function stopCalling(room) {
  if (room.callTimer) {
    clearInterval(room.callTimer);
    room.callTimer = null;
  }
}

function finishRoom(room, winnerId, winningLine) {
  stopCalling(room);
  room.phase = "finished";
  room.winnerId = winnerId;
  room.winningLine = winningLine;
  if (winnerId) {
    const w = room.players.get(winnerId);
    if (w) w.won = true;
  }
  broadcastState(room);
}

// ── Room lifecycle upkeep ────────────────────────────────────────────────────

function markMaybeEmpty(room) {
  const anyConnected = [...room.players.values()].some((p) => p.sse !== null);
  room.emptySince = anyConnected ? null : Date.now();
}

// Sweep abandoned rooms periodically. Unref so it never keeps the process alive.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
      stopCalling(room);
      rooms.delete(id);
    }
  }
}, 60000);
if (typeof sweeper.unref === "function") sweeper.unref();

// ── Auth helper ──────────────────────────────────────────────────────────────

/** Resolve and authenticate a player from the request body/query. */
function authPlayer(room, playerId, token) {
  if (!room) return { error: 404, message: "Room not found" };
  const player = room.players.get(String(playerId ?? ""));
  if (!player) return { error: 404, message: "You are not in this room" };
  if (player.token !== token) return { error: 403, message: "Invalid credentials" };
  return { player };
}

// ── Router ───────────────────────────────────────────────────────────────────

export function createBingoRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));

  // Create a room and become its host.
  router.post("/rooms", (req, res) => {
    const name = sanitizeName(req.body?.playerName, "Host");
    const room = createRoom({
      winPattern: req.body?.winPattern,
      callIntervalMs: req.body?.callIntervalMs,
    });
    const host = addPlayer(room, name, true);
    res.status(201).json({ room: publicState(room), you: { ...selfState(host), token: host.token } });
  });

  // Join an existing room's lobby.
  router.post("/rooms/:code/join", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (room.phase !== "lobby") return res.status(409).json({ message: "That game has already started" });
    if (room.players.size >= MAX_PLAYERS) return res.status(409).json({ message: "This room is full" });
    const name = sanitizeName(req.body?.playerName, `Player ${room.players.size + 1}`);
    const player = addPlayer(room, name, false);
    broadcastState(room);
    res.status(201).json({ room: publicState(room), you: { ...selfState(player), token: player.token } });
  });

  // Rehydrate an existing identity (after a reload) — returns card + state.
  router.get("/rooms/:code/me", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const auth = authPlayer(room, req.query.playerId, req.query.token);
    if (auth.error) return res.status(auth.error).json({ message: auth.message });
    res.json({ room: publicState(room), you: selfState(auth.player) });
  });

  // Live event stream (Server-Sent Events).
  router.get("/rooms/:code/events", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const auth = authPlayer(room, req.query.playerId, req.query.token);
    if (auth.error) return res.status(auth.error).json({ message: auth.message });
    const player = auth.player;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    // Only one live stream per player; replace any stale one.
    if (player.sse && player.sse !== res) {
      try {
        player.sse.end();
      } catch {
        // already gone
      }
    }
    player.sse = res;
    room.emptySince = null;

    sendEvent(res, "state", publicState(room));
    sendEvent(res, "self", selfState(player));
    broadcastState(room); // let others see the reconnection

    const keepalive = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        // cleaned up on close
      }
    }, SSE_KEEPALIVE_MS);

    req.on("close", () => {
      clearInterval(keepalive);
      if (player.sse === res) player.sse = null;
      // A room may have been swept already.
      if (rooms.has(room.id)) {
        markMaybeEmpty(room);
        broadcastState(room);
      }
    });
  });

  // Host starts the game.
  router.post("/rooms/:code/start", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const auth = authPlayer(room, req.body?.playerId, req.body?.token);
    if (auth.error) return res.status(auth.error).json({ message: auth.message });
    if (!auth.player.isHost) return res.status(403).json({ message: "Only the host can start the game" });
    if (room.phase !== "lobby") return res.status(409).json({ message: "The game is already underway" });
    room.phase = "playing";
    startCalling(room);
    broadcastState(room);
    res.json({ ok: true });
  });

  // Claim a bingo. The server is the sole judge.
  router.post("/rooms/:code/claim", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const auth = authPlayer(room, req.body?.playerId, req.body?.token);
    if (auth.error) return res.status(auth.error).json({ message: auth.message });
    if (room.phase !== "playing") return res.status(409).json({ message: "No game in progress" });
    const win = findWin(auth.player.card, room.calledSet, room.winPattern);
    if (!win) return res.status(200).json({ ok: false, message: "Not a bingo yet — keep daubing!" });
    finishRoom(room, auth.player.id, win.cells);
    res.json({ ok: true, winningLine: win.cells });
  });

  // Host resets a finished game back to the lobby with fresh cards.
  router.post("/rooms/:code/restart", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const auth = authPlayer(room, req.body?.playerId, req.body?.token);
    if (auth.error) return res.status(auth.error).json({ message: auth.message });
    if (!auth.player.isHost) return res.status(403).json({ message: "Only the host can restart" });
    stopCalling(room);
    room.phase = "lobby";
    room.calledNumbers = [];
    room.calledSet = new Set();
    room.winnerId = null;
    room.winningLine = null;
    for (const p of room.players.values()) {
      p.won = false;
      p.card = makeCard();
    }
    // Push everyone their new card, then the shared state.
    for (const p of room.players.values()) {
      if (p.sse) sendEvent(p.sse, "self", selfState(p));
    }
    broadcastState(room);
    res.json({ ok: true });
  });

  // Leave the room. If the host leaves, hand the crown to someone else.
  router.post("/rooms/:code/leave", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const auth = authPlayer(room, req.body?.playerId, req.body?.token);
    if (auth.error) return res.status(auth.error).json({ message: auth.message });
    const wasHost = auth.player.isHost;
    if (auth.player.sse) {
      try {
        auth.player.sse.end();
      } catch {
        // already closed
      }
    }
    room.players.delete(auth.player.id);
    if (room.players.size === 0) {
      stopCalling(room);
      rooms.delete(room.id);
      return res.json({ ok: true });
    }
    if (wasHost) {
      const next = room.players.values().next().value;
      next.isHost = true;
      room.hostPlayerId = next.id;
    }
    broadcastState(room);
    res.json({ ok: true });
  });

  return router;
}
