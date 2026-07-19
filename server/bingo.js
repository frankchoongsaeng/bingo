// Real-time multiplayer bingo — in-memory game engine + Express router (SSE).
//
// This module is imported directly by `server.js` (outside the React Router /
// Vite bundle), so it is plain ES-module JavaScript rather than TypeScript.
// State lives in process memory: the app runs as a single Node process, so a
// `Map` of rooms is sufficient for a lobby-based party game. Nothing here is
// persisted — rooms evaporate when the process restarts, which is the right
// lifetime for an ephemeral game session.
//
// Classic 75-ball bingo, played in turns:
//   - Each player gets a 5x5 card. Columns are B(1-15) I(16-30) N(31-45)
//     G(46-60) O(61-75); the centre square is a free space.
//   - Once the host starts, players take turns. On your turn you pick a square on
//     your own card and call that number, and the call plays for everyone — the
//     server pushes it to every connected client over Server-Sent Events and
//     moves the turn on.
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

// "bingo" mode: complete this many lines to spell out B-I-N-G-O and win.
const BINGO_LINE_GOAL = 5;
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

/** Count how many of the 12 winning lines a card has fully marked. */
function completedLines(card, called) {
  const isMarked = (idx) => card[idx] === 0 || called.has(card[idx]);
  return WIN_LINES.filter((line) => line.every(isMarked));
}

/**
 * Given a card and the set of called numbers, return the winning pattern the
 * card satisfies, or null. The free centre square always counts as marked.
 *
 *   - "line":     any single row, column or diagonal.
 *   - "bingo":    complete five lines to spell out B-I-N-G-O (the default).
 *   - "blackout": every square marked.
 *
 * @param {number[]} card
 * @param {Set<number>} called
 * @param {"line"|"bingo"|"blackout"} pattern
 * @returns {{ kind: string, cells: number[] } | null}
 */
function findWin(card, called, pattern) {
  const isMarked = (idx) => card[idx] === 0 || called.has(card[idx]);
  if (pattern === "blackout") {
    const all = card.every((n) => n === 0 || called.has(n));
    if (all) return { kind: "blackout", cells: card.map((_, i) => i) };
    return null;
  }
  if (pattern === "bingo") {
    const lines = completedLines(card, called);
    if (lines.length >= BINGO_LINE_GOAL) {
      return { kind: "bingo", cells: [...new Set(lines.flat())] };
    }
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
 * @property {"line"|"bingo"|"blackout"} winPattern
 * @property {Map<string, Player>} players
 * @property {number[]} calledNumbers
 * @property {Set<number>} calledSet
 * @property {string|null} turnPlayerId
 * @property {string|null} winnerId
 * @property {number[]|null} winningLine
 * @property {number|null} emptySince
 */

function normalizeWinPattern(raw) {
  if (raw === "blackout") return "blackout";
  if (raw === "line") return "line";
  return "bingo"; // default: spell out B-I-N-G-O across five lines
}

function createRoom({ winPattern }) {
  const id = makeRoomCode();
  /** @type {Room} */
  const room = {
    id,
    phase: "lobby",
    hostPlayerId: "",
    winPattern: normalizeWinPattern(winPattern),
    players: new Map(),
    calledNumbers: [],
    calledSet: new Set(),
    turnPlayerId: null,
    winnerId: null,
    winningLine: null,
    emptySince: null,
  };
  rooms.set(id, room);
  return room;
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
  const turnPlayer = room.turnPlayerId ? room.players.get(room.turnPlayerId) : null;
  return {
    id: room.id,
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    winPattern: room.winPattern,
    lineGoal: BINGO_LINE_GOAL,
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
    turnPlayerId: room.turnPlayerId,
    turnPlayerName: turnPlayer ? turnPlayer.name : null,
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

// ── Turn-based number calling ────────────────────────────────────────────────

// Hand the turn to the next connected player after the current one, wrapping
// around. Falls back to the next player in order if nobody is connected.
function advanceTurn(room) {
  const ids = [...room.players.keys()];
  if (ids.length === 0) {
    room.turnPlayerId = null;
    return;
  }
  const start = ids.indexOf(room.turnPlayerId); // -1 when unset/absent
  for (let step = 1; step <= ids.length; step++) {
    const candidate = ids[(start + step) % ids.length];
    if (room.players.get(candidate)?.sse) {
      room.turnPlayerId = candidate;
      return;
    }
  }
  room.turnPlayerId = ids[(start + 1) % ids.length];
}

// If the player whose turn it is has gone (left or disconnected), move on so
// the game doesn't stall. Broadcasts if the turn actually changed.
function ensureLiveTurn(room) {
  if (room.phase !== "playing") return;
  const current = room.turnPlayerId ? room.players.get(room.turnPlayerId) : null;
  if (current && current.sse) return;
  const before = room.turnPlayerId;
  advanceTurn(room);
  if (room.turnPlayerId !== before) broadcastState(room);
}

function finishRoom(room, winnerId, winningLine) {
  room.phase = "finished";
  room.turnPlayerId = null;
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
    const room = createRoom({ winPattern: req.body?.winPattern });
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
    // If the turn was stranded on an absent player, a fresh connection can move
    // it along (e.g. to this player if they're now the only one live).
    ensureLiveTurn(room);

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
        // Don't let a dropped connection freeze the turn on an absent player.
        ensureLiveTurn(room);
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
    // First turn goes to the host (the first player added to the room).
    room.turnPlayerId = null;
    advanceTurn(room);
    broadcastState(room);
    res.json({ ok: true });
  });

  // Call a number. Only the player whose turn it is may call, and the call
  // plays for everyone. The turn then passes to the next player.
  router.post("/rooms/:code/call", (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const auth = authPlayer(room, req.body?.playerId, req.body?.token);
    if (auth.error) return res.status(auth.error).json({ message: auth.message });
    if (room.phase !== "playing") return res.status(409).json({ message: "No game in progress" });
    if (room.turnPlayerId !== auth.player.id) {
      return res.status(409).json({ message: "It's not your turn to call" });
    }
    const number = Number(req.body?.number);
    if (!Number.isInteger(number) || number < 1 || number > 75) {
      return res.status(400).json({ message: "Pick a number from 1 to 75" });
    }
    if (room.calledSet.has(number)) {
      return res.status(409).json({ message: "That number has already been called" });
    }
    room.calledNumbers.push(number);
    room.calledSet.add(number);
    if (room.calledNumbers.length >= 75) {
      // Every number is out with no winner — the round is a draw.
      finishRoom(room, null, null);
      return res.json({ ok: true });
    }
    advanceTurn(room);
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
    room.phase = "lobby";
    room.calledNumbers = [];
    room.calledSet = new Set();
    room.turnPlayerId = null;
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
    const wasTheirTurn = room.turnPlayerId === auth.player.id;
    room.players.delete(auth.player.id);
    if (room.players.size === 0) {
      rooms.delete(room.id);
      return res.json({ ok: true });
    }
    if (wasHost) {
      const next = room.players.values().next().value;
      next.isHost = true;
      room.hostPlayerId = next.id;
    }
    // If the departing player held the turn, pass it on so play continues.
    if (wasTheirTurn && room.phase === "playing") advanceTurn(room);
    broadcastState(room);
    res.json({ ok: true });
  });

  return router;
}
