import { useMemo, useState } from "react";
import { Check, Copy, Crown, LogOut, Loader2, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";

import { BingoCard } from "./BingoCard";
import { JoinInline } from "./JoinInline";
import { useBingoRoom } from "./useBingoRoom";
import {
  BINGO_LETTERS,
  completedLineCount,
  hasCompletableWin,
  letterFor,
  type RoomState,
} from "./types";

export function BingoRoomView({ code, onLeave }: { code: string; onLeave: () => void }) {
  const bingo = useBingoRoom(code);
  const { room, self, status, needsJoin } = bingo;

  if (needsJoin) {
    return <JoinInline code={code} />;
  }

  if (!room || !self) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p>Connecting to room {code}…</p>
      </div>
    );
  }

  const calledSet = new Set(room.calledNumbers);
  const isHost = self.isHost;
  const someoneWon = room.phase === "finished" && !!room.winnerId;
  const iWon = room.winnerId === self.id;
  const iHaveWin = room.phase === "playing" && hasCompletableWin(self.card, calledSet, room.winPattern);
  const isMyTurn = room.phase === "playing" && room.turnPlayerId === self.id;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <RoomHeader code={code} status={status} onLeave={() => bingo.leave().finally(onLeave)} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="order-2 lg:order-1">
          {room.phase === "lobby" && (
            <LobbyPanel
              isHost={isHost}
              winPattern={room.winPattern}
              playerCount={room.players.length}
              onStart={bingo.start}
            />
          )}

          {room.phase !== "lobby" && (
            <div className="space-y-6">
              <CallPanel room={room} isMyTurn={isMyTurn} selfId={self.id} />

              {someoneWon && (
                <WinnerBanner
                  iWon={iWon}
                  winnerName={room.winnerName ?? "Someone"}
                  isHost={isHost}
                  onRestart={bingo.restart}
                />
              )}

              <div className="space-y-3">
                {room.winPattern === "bingo" && (
                  <BingoProgress
                    lines={completedLineCount(self.card, calledSet)}
                    goal={room.lineGoal}
                  />
                )}

                <BingoCard
                  card={self.card}
                  calledSet={calledSet}
                  winningLine={iWon ? room.winningLine : null}
                  dimmed={someoneWon && !iWon}
                  callable={room.phase === "playing" && isMyTurn}
                  onCall={bingo.call}
                />

                {room.phase === "playing" && (
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <Button
                      size="lg"
                      className={cn("w-full text-base", iHaveWin && "animate-pulse")}
                      variant={iHaveWin ? "default" : "secondary"}
                      onClick={bingo.claim}
                    >
                      BINGO!
                    </Button>
                    {bingo.claimResult && (
                      <p
                        className={cn(
                          "text-center text-sm font-medium",
                          bingo.claimResult.startsWith("BINGO") ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {bingo.claimResult}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {bingo.actionError && (
            <p className="mt-4 text-center text-sm text-destructive">{bingo.actionError}</p>
          )}
        </div>

        <aside className="order-1 lg:order-2">
          <PlayerList
            players={room.players}
            selfId={self.id}
            winnerId={room.winnerId}
            phase={room.phase}
          />
        </aside>
      </div>
    </div>
  );
}

function RoomHeader({
  code,
  status,
  onLeave,
}: {
  code: string;
  status: string;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — no-op
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Room</span>
        <span className="rounded-md bg-muted px-3 py-1 font-mono text-xl font-bold tracking-widest">
          {code}
        </span>
        <ConnectionDot status={status} />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Invite link"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onLeave}>
          <LogOut className="size-4" />
          Leave
        </Button>
      </div>
    </div>
  );
}

function ConnectionDot({ status }: { status: string }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Wifi className="size-3.5 text-primary" /> live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <WifiOff className="size-3.5" /> {status}
    </span>
  );
}

function winPatternBlurb(winPattern: string): string {
  if (winPattern === "blackout") return "filling the whole card (blackout)";
  if (winPattern === "line") return "completing any line — row, column, or diagonal";
  return "completing five lines to spell out B-I-N-G-O";
}

function LobbyPanel({
  isHost,
  winPattern,
  playerCount,
  onStart,
}: {
  isHost: boolean;
  winPattern: string;
  playerCount: number;
  onStart: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold">Waiting in the lobby</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Share the room code so friends can join. Players take turns tapping a square on
        their own card to call it — each call plays for everyone. Win by{" "}
        {winPatternBlurb(winPattern)}.
      </p>
      <div className="mt-6">
        {isHost ? (
          <Button size="lg" onClick={onStart} disabled={playerCount < 1}>
            Start game
          </Button>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Waiting for the host to start…
          </p>
        )}
      </div>
    </div>
  );
}

function CallPanel({
  room,
  isMyTurn,
  selfId,
}: {
  room: RoomState;
  isMyTurn: boolean;
  selfId: string;
}) {
  const recent = useMemo(() => room.calledNumbers.slice(-8).reverse(), [room.calledNumbers]);
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest call</p>
          {room.currentNumber ? (
            <p className="mt-1 text-4xl font-bold tabular-nums">
              <span className="text-primary">{letterFor(room.currentNumber)}</span>
              <span className="ml-1">{room.currentNumber}</span>
            </p>
          ) : (
            <p className="mt-1 text-2xl font-medium text-muted-foreground">—</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Numbers left</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{room.callsRemaining}</p>
        </div>
      </div>

      {room.phase === "playing" && (
        <div
          className={cn(
            "mt-4 rounded-lg px-3 py-2 text-center text-sm font-medium",
            isMyTurn ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {isMyTurn ? (
            "Your turn — tap a square on your card to call it for everyone."
          ) : room.turnPlayerName ? (
            <>
              Waiting for <span className="font-semibold">{room.turnPlayerName}</span>
              {room.turnPlayerId === selfId ? " (you)" : ""} to call…
            </>
          ) : (
            "Waiting for the next caller…"
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {recent.map((n) => (
          <span
            key={n}
            className="inline-flex items-center rounded-md bg-muted px-2 py-1 font-mono text-sm tabular-nums"
          >
            {letterFor(n)}
            {n}
          </span>
        ))}
        {recent.length === 0 && <span className="text-sm text-muted-foreground">No numbers called yet…</span>}
      </div>
    </div>
  );
}

/** BINGO letter progress — a letter lights up for each completed line. */
function BingoProgress({ lines, goal }: { lines: number; goal: number }) {
  const won = Math.min(lines, goal);
  return (
    <div className="mx-auto flex max-w-sm items-center justify-center gap-1.5">
      {BINGO_LETTERS.map((letter, i) => (
        <span
          key={letter}
          className={cn(
            "flex size-9 items-center justify-center rounded-md text-lg font-bold transition-colors",
            i < won
              ? "bg-primary text-primary-foreground"
              : "border border-dashed border-muted-foreground/30 text-muted-foreground/40",
          )}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

function WinnerBanner({
  iWon,
  winnerName,
  isHost,
  onRestart,
}: {
  iWon: boolean;
  winnerName: string;
  isHost: boolean;
  onRestart: () => void;
}) {
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/10 p-5 text-center">
      <p className="text-lg font-semibold text-primary">
        {iWon ? "🎉 You got BINGO! You win!" : `${winnerName} got BINGO!`}
      </p>
      {isHost && (
        <Button className="mt-3" variant="outline" onClick={onRestart}>
          Play again
        </Button>
      )}
    </div>
  );
}

function PlayerList({
  players,
  selfId,
  winnerId,
  phase,
}: {
  players: { id: string; name: string; isHost: boolean; connected: boolean; won: boolean }[];
  selfId: string;
  winnerId: string | null;
  phase: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
        Players ({players.length})
      </h3>
      <ul className="space-y-1.5">
        {players.map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
              p.id === selfId && "bg-muted",
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  p.connected ? "bg-primary" : "bg-muted-foreground/40",
                )}
                title={p.connected ? "connected" : "offline"}
              />
              <span className="truncate font-medium">
                {p.name}
                {p.id === selfId && <span className="text-muted-foreground"> (you)</span>}
              </span>
              {p.isHost && <Crown className="size-3.5 shrink-0 text-amber-500" />}
            </span>
            {phase === "finished" && p.id === winnerId && (
              <Badge className="shrink-0">Winner</Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
