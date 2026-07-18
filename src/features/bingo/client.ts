// Thin client for the bingo HTTP/SSE API, plus localStorage identity helpers.
import type { Identity, RoomState, SelfState, WinPattern } from "./types";

const BASE = "/api/bingo";

export interface JoinResult {
  room: RoomState;
  you: SelfState & { token: string };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function createRoom(input: {
  playerName: string;
  winPattern: WinPattern;
}): Promise<JoinResult> {
  return postJson<JoinResult>("/rooms", input);
}

export function joinRoom(code: string, playerName: string): Promise<JoinResult> {
  return postJson<JoinResult>(`/rooms/${encodeURIComponent(code)}/join`, { playerName });
}

export function startGame(code: string, id: Identity) {
  return postJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(code)}/start`, id.token ? idBody(id) : {});
}

export function callNumber(code: string, id: Identity, number: number) {
  return postJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(code)}/call`, {
    ...idBody(id),
    number,
  });
}

export function claimBingo(code: string, id: Identity) {
  return postJson<{ ok: boolean; message?: string; winningLine?: number[] }>(
    `/rooms/${encodeURIComponent(code)}/claim`,
    idBody(id),
  );
}

export function restartGame(code: string, id: Identity) {
  return postJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(code)}/restart`, idBody(id));
}

export function leaveRoom(code: string, id: Identity) {
  return postJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(code)}/leave`, idBody(id));
}

export async function fetchMe(
  code: string,
  id: Identity,
): Promise<{ room: RoomState; you: SelfState } | null> {
  const params = new URLSearchParams({ playerId: id.playerId, token: id.token });
  const res = await fetch(`${BASE}/rooms/${encodeURIComponent(code)}/me?${params.toString()}`);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as { room: RoomState; you: SelfState };
}

export function eventsUrl(code: string, id: Identity): string {
  const params = new URLSearchParams({ playerId: id.playerId, token: id.token });
  return `${BASE}/rooms/${encodeURIComponent(code)}/events?${params.toString()}`;
}

function idBody(id: Identity) {
  return { playerId: id.playerId, token: id.token };
}

// ── localStorage identity ────────────────────────────────────────────────────

const storageKey = (code: string) => `chota:bingo:${code.toUpperCase()}`;

export function saveIdentity(code: string, id: Identity) {
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(id));
  } catch {
    // storage unavailable (private mode); the session just won't survive reload
  }
}

export function loadIdentity(code: string): Identity | null {
  try {
    const raw = localStorage.getItem(storageKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Identity;
    if (parsed?.playerId && parsed?.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearIdentity(code: string) {
  try {
    localStorage.removeItem(storageKey(code));
  } catch {
    // ignore
  }
}
