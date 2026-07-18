// Shared types for the real-time bingo client. These mirror the JSON shapes
// produced by `src/server/games/bingo.server.js`.

export type WinPattern = "line" | "bingo" | "blackout";
export type Phase = "lobby" | "playing" | "finished";

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  won: boolean;
}

export interface RoomState {
  id: string;
  phase: Phase;
  hostPlayerId: string;
  winPattern: WinPattern;
  /** Lines needed to win in "bingo" mode (spell out B-I-N-G-O). */
  lineGoal: number;
  players: PublicPlayer[];
  calledNumbers: number[];
  currentNumber: number | null;
  callsRemaining: number;
  /** The player whose turn it is to call a number (playing phase only). */
  turnPlayerId: string | null;
  turnPlayerName: string | null;
  winnerId: string | null;
  winnerName: string | null;
  winningLine: number[] | null;
}

export interface SelfState {
  id: string;
  name: string;
  /** 25 cells, row-major. 0 is the free centre square. */
  card: number[];
  isHost: boolean;
  won: boolean;
}

/** Per-room credentials persisted in localStorage. */
export interface Identity {
  playerId: string;
  token: string;
}

export const BINGO_LETTERS = ["B", "I", "N", "G", "O"] as const;

/** Lines needed to spell out B-I-N-G-O and win in "bingo" mode. */
export const BINGO_LINE_GOAL = 5;

/** The B/I/N/G/O letter for a called number (1-75). */
export function letterFor(n: number): string {
  return BINGO_LETTERS[Math.floor((n - 1) / 15)] ?? "";
}

/** All 12 winning lines (5 rows + 5 columns + 2 diagonals) as cell indices. */
export const WIN_LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

/** How many of the 12 winning lines the card has fully marked. */
export function completedLineCount(card: number[], called: Set<number>): number {
  const marked = (i: number) => card[i] === 0 || called.has(card[i]);
  return WIN_LINES.filter((line) => line.every(marked)).length;
}

/**
 * Client-side mirror of the server's win check, used to light up the BINGO
 * button when the player actually has a completable pattern. The server remains
 * the sole judge on claim.
 */
export function hasCompletableWin(
  card: number[],
  called: Set<number>,
  pattern: WinPattern,
): boolean {
  if (pattern === "blackout") return card.every((n) => n === 0 || called.has(n));
  const lines = completedLineCount(card, called);
  return pattern === "bingo" ? lines >= BINGO_LINE_GOAL : lines >= 1;
}
