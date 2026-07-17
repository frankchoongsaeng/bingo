// Shared types for the real-time bingo client. These mirror the JSON shapes
// produced by `src/server/games/bingo.server.js`.

export type WinPattern = "line" | "blackout";
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
  callIntervalMs: number;
  players: PublicPlayer[];
  calledNumbers: number[];
  currentNumber: number | null;
  callsRemaining: number;
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

/** The B/I/N/G/O letter for a called number (1-75). */
export function letterFor(n: number): string {
  return BINGO_LETTERS[Math.floor((n - 1) / 15)] ?? "";
}
