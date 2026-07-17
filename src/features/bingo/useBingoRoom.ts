import { useCallback, useEffect, useRef, useState } from "react";

import type { Identity, RoomState, SelfState } from "./types";
import {
  claimBingo,
  clearIdentity,
  eventsUrl,
  fetchMe,
  leaveRoom,
  loadIdentity,
  restartGame,
  startGame,
} from "./client";

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "closed";

export interface BingoRoom {
  room: RoomState | null;
  self: SelfState | null;
  status: ConnectionStatus;
  /** True once we've confirmed there's no valid identity for this room. */
  needsJoin: boolean;
  actionError: string | null;
  claimResult: string | null;
  clearMessages: () => void;
  start: () => Promise<void>;
  claim: () => Promise<void>;
  restart: () => Promise<void>;
  leave: () => Promise<void>;
}

/**
 * Connects the browser to a bingo room over Server-Sent Events and exposes the
 * live room + private card state, plus the player's actions. Identity is read
 * from localStorage (written by the create/join flow).
 */
export function useBingoRoom(code: string): BingoRoom {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [self, setSelf] = useState<SelfState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [needsJoin, setNeedsJoin] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<string | null>(null);

  const identityRef = useRef<Identity | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(
    (identity: Identity) => {
      sourceRef.current?.close();
      const source = new EventSource(eventsUrl(code, identity));
      sourceRef.current = source;

      source.addEventListener("open", () => setStatus("live"));
      source.addEventListener("state", (e) => {
        setRoom(JSON.parse((e as MessageEvent).data) as RoomState);
        setStatus("live");
      });
      source.addEventListener("self", (e) => {
        setSelf(JSON.parse((e as MessageEvent).data) as SelfState);
      });
      source.addEventListener("error", () => {
        // EventSource retries on its own; reflect the interim state.
        setStatus((s) => (s === "live" ? "reconnecting" : s === "closed" ? "closed" : "connecting"));
      });
    },
    [code],
  );

  // Bootstrap: hydrate from the server, then open the stream.
  useEffect(() => {
    let cancelled = false;
    const identity = loadIdentity(code);
    if (!identity) {
      setNeedsJoin(true);
      setStatus("closed");
      return;
    }
    identityRef.current = identity;
    setStatus("connecting");
    fetchMe(code, identity)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          // Stale or unknown identity — the room is gone or we were removed.
          clearIdentity(code);
          setNeedsJoin(true);
          setStatus("closed");
          return;
        }
        setRoom(data.room);
        setSelf(data.you);
        connect(identity);
      })
      .catch(() => {
        if (!cancelled) setStatus("reconnecting");
      });

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [code, connect]);

  const clearMessages = useCallback(() => {
    setActionError(null);
    setClaimResult(null);
  }, []);

  const withIdentity = useCallback(
    async (fn: (id: Identity) => Promise<void>) => {
      const id = identityRef.current;
      if (!id) {
        setNeedsJoin(true);
        return;
      }
      try {
        setActionError(null);
        await fn(id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Something went wrong");
      }
    },
    [],
  );

  const start = useCallback(
    () => withIdentity((id) => startGame(code, id).then(() => undefined)),
    [code, withIdentity],
  );

  const claim = useCallback(
    () =>
      withIdentity(async (id) => {
        const res = await claimBingo(code, id);
        setClaimResult(res.ok ? "BINGO! You won! 🎉" : (res.message ?? "Not yet!"));
      }),
    [code, withIdentity],
  );

  const restart = useCallback(
    () => withIdentity((id) => restartGame(code, id).then(() => undefined)),
    [code, withIdentity],
  );

  const leave = useCallback(
    () =>
      withIdentity(async (id) => {
        await leaveRoom(code, id);
        clearIdentity(code);
        sourceRef.current?.close();
      }),
    [code, withIdentity],
  );

  return {
    room,
    self,
    status,
    needsJoin,
    actionError,
    claimResult,
    clearMessages,
    start,
    claim,
    restart,
    leave,
  };
}
