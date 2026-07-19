import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Crown, LogOut, Loader2, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";

import { BingoCard } from "./BingoCard";
import { JoinInline } from "./JoinInline";
import { SoundToggle } from "./SoundToggle";
import { sfx } from "./sound";
import { useBingoRoom } from "./useBingoRoom";
import {
  BINGO_LETTERS,
  completedLineCount,
  hasCompletableWin,
  letterFor,
  type RoomState,
} from "./types";

// Signage colours, keyed by the B/I/N/G/O column a number lives in.
const COLUMN_COLORS = ["#c33a4e", "#2a2016", "#1d4d37", "#a8801c", "#c33a4e"];
const columnColor = (n: number) =>
  COLUMN_COLORS[Math.max(0, Math.min(4, Math.floor((n - 1) / 15)))];

export function BingoRoomView({ code, onLeave }: { code: string; onLeave: () => void }) {
  const bingo = useBingoRoom(code);
  const { room, self, status, needsJoin } = bingo;

  // The caller's tentative pick — a cell index on their own card, not yet
  // called. Committed via the Call button; cleared whenever the turn leaves.
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const isMyTurn = room?.phase === "playing" && room.turnPlayerId === self?.id;
  useEffect(() => {
    if (!isMyTurn) setPendingCell(null);
  }, [isMyTurn]);

  // ── Reactive sound effects. Each keeps a "prev" ref and skips the first run
  // so hydrating into an in-progress room doesn't fire a burst of noise. ──
  const currentNumber = room?.currentNumber ?? null;
  const prevCall = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (prevCall.current === undefined) prevCall.current = currentNumber;
    else if (currentNumber !== prevCall.current) {
      prevCall.current = currentNumber;
      if (currentNumber !== null) sfx.call();
    }
  }, [currentNumber]);

  const myDaubs =
    self && room
      ? self.card.filter((n) => n !== 0 && room.calledNumbers.includes(n)).length
      : 0;
  const prevDaubs = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prevDaubs.current === undefined) prevDaubs.current = myDaubs;
    else {
      if (myDaubs > prevDaubs.current) sfx.daub();
      prevDaubs.current = myDaubs;
    }
  }, [myDaubs]);

  const prevTurn = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (prevTurn.current === undefined) prevTurn.current = isMyTurn;
    else {
      if (isMyTurn && !prevTurn.current) sfx.turn();
      prevTurn.current = isMyTurn;
    }
  }, [isMyTurn]);

  const finishedWin = room?.phase === "finished" && !!room?.winnerId;
  const prevWin = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (prevWin.current === undefined) prevWin.current = finishedWin;
    else {
      if (finishedWin && !prevWin.current) sfx.win();
      prevWin.current = finishedWin;
    }
  }, [finishedWin]);

  useEffect(() => {
    if (bingo.actionError) sfx.buzz();
  }, [bingo.actionError]);

  useEffect(() => {
    if (bingo.claimResult && !bingo.claimResult.startsWith("BINGO")) sfx.buzz();
  }, [bingo.claimResult]);

  // ── Rival B-I-N-G-O progress: a toast + chime whenever another player
  // completes a new line (bingo mode only). Baseline on first sight so
  // hydrating into a game in progress doesn't announce old lines. ──
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const noticeSeq = useRef(0);
  const prevLines = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!room || room.winPattern !== "bingo") return;
    for (const pl of room.players) {
      const cur = Math.min(pl.lines, 5);
      const prev = prevLines.current.get(pl.id);
      prevLines.current.set(pl.id, cur);
      if (prev === undefined) continue;
      if (cur > prev && pl.id !== self?.id && room.phase === "playing") {
        const text =
          cur >= 5
            ? `${pl.name} has a full BINGO!`
            : cur === 4
              ? `${pl.name} needs one more line!`
              : `${pl.name} completed a line — ${cur}/5`;
        const id = ++noticeSeq.current;
        setNotices((n) => [...n, { id, text }]);
        setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 3800);
        sfx.letter();
      }
    }
  }, [room, self?.id]);

  if (needsJoin) {
    return <JoinInline code={code} />;
  }

  if (!room || !self) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-cream/80">
        <Loader2 className="size-6 animate-spin text-brass-hi" />
        <p className="script text-xl">Finding your table…</p>
      </div>
    );
  }

  const calledSet = new Set(room.calledNumbers);
  const isHost = self.isHost;
  const someoneWon = room.phase === "finished" && !!room.winnerId;
  const iWon = room.winnerId === self.id;
  const iHaveWin = room.phase === "playing" && hasCompletableWin(self.card, calledSet, room.winPattern);

  const callPending = () => {
    if (pendingCell === null) return;
    sfx.click();
    bingo.call(self.card[pendingCell]);
    setPendingCell(null);
  };

  const selectCell = (i: number) => {
    sfx.pick();
    setPendingCell((prev) => (prev === i ? null : i));
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-9">
      <NoticeStack notices={notices} />
      <RoomHeader code={code} status={status} onLeave={() => bingo.leave().finally(onLeave)} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="order-2 lg:order-1">
          {room.phase === "lobby" && (
            <LobbyPanel
              isHost={isHost}
              winPattern={room.winPattern}
              playerCount={room.players.length}
              onStart={() => {
                sfx.start();
                bingo.start();
              }}
            />
          )}

          {room.phase !== "lobby" && (
            <div className="space-y-5">
              {someoneWon && (
                <WinnerBanner
                  iWon={iWon}
                  winnerName={room.winnerName ?? "Someone"}
                  isHost={isHost}
                  onRestart={bingo.restart}
                />
              )}

              <div className="space-y-4">
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
                  selectedCell={pendingCell}
                  onSelectCell={selectCell}
                />

                {room.phase === "playing" && !isMyTurn && (
                  <TurnLine
                    turnPlayerName={room.turnPlayerName}
                    isSelf={room.turnPlayerId === self.id}
                  />
                )}

                {room.phase === "playing" && isMyTurn && (
                  <div className="mx-auto max-w-sm">
                    <Button
                      size="lg"
                      className="w-full text-lg signage tracking-normal"
                      disabled={pendingCell === null}
                      onClick={callPending}
                    >
                      {pendingCell === null
                        ? "Pick a square to call"
                        : `Call it — ${letterFor(self.card[pendingCell])}${self.card[pendingCell]}`}
                    </Button>
                  </div>
                )}

                {/* The claim only appears once you actually have a winning
                    pattern — otherwise it's just loud, misleading clutter. */}
                {room.phase === "playing" && iHaveWin && (
                  <div className="mx-auto max-w-sm animate-deal">
                    <BingoButton
                      lit
                      onClick={() => {
                        sfx.click();
                        bingo.claim();
                      }}
                    />
                  </div>
                )}
                {room.phase === "playing" && bingo.claimResult && (
                  <p
                    className={cn(
                      "mx-auto max-w-sm text-center text-sm font-semibold",
                      bingo.claimResult.startsWith("BINGO")
                        ? "text-brass-hi"
                        : "text-cream/70",
                    )}
                  >
                    {bingo.claimResult}
                  </p>
                )}

                {/* The calling card — a small one-line reference to what's out,
                    sitting below the call button. */}
                <CallStrip room={room} />
              </div>
            </div>
          )}

          {bingo.actionError && (
            <p className="mt-4 text-center text-sm font-semibold text-[#f2a8a0]">
              {bingo.actionError}
            </p>
          )}
        </div>

        <aside className="order-1 lg:order-2">
          <PlayerList
            players={room.players}
            selfId={self.id}
            winnerId={room.winnerId}
            phase={room.phase}
            winPattern={room.winPattern}
          />
        </aside>
      </div>
    </div>
  );
}

/** A glossy bingo ball with a column-coloured ring. */
function Ball({ n, size = "lg" }: { n: number; size?: "lg" | "sm" }) {
  const color = columnColor(n);
  const big = size === "lg";
  return (
    <div className="shrink-0 rounded-full p-[3px]" style={{ background: color }}>
      <div
        className={cn(
          "ball flex flex-col items-center justify-center rounded-full",
          big ? "size-24 sm:size-28" : "size-9",
        )}
      >
        <span
          className="signage leading-none"
          style={{ color, fontSize: big ? "0.85rem" : "0.42rem" }}
        >
          {letterFor(n)}
        </span>
        <span
          className={cn("signage leading-none text-ink", big ? "text-4xl sm:text-5xl" : "text-sm")}
        >
          {n}
        </span>
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
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="signage text-2xl text-brass-hi drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
          BINGO
        </span>
        <ConnectionDot status={status} />
      </div>
      <div className="flex items-center gap-3">
        {/* The session code, printed on a torn ticket stub. */}
        <div className="relative flex items-center gap-2 rounded-md bg-cream px-3 py-1.5 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)]">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-ink-soft">
            Session
          </span>
          <span className="ticketnum text-xl font-bold tracking-[0.25em] text-dauber-2">
            {code}
          </span>
        </div>
        <SoundToggle />
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Invite"}
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
  const live = status === "live";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-cream/60">
      {live ? (
        <Wifi className="size-3.5 text-brass-hi" />
      ) : (
        <WifiOff className="size-3.5" />
      )}
      {live ? "live" : status}
    </span>
  );
}

function winPatternBlurb(winPattern: string): string {
  if (winPattern === "blackout") return "daubing the whole ticket — a full house";
  if (winPattern === "line") return "daubing any line — row, column, or diagonal";
  return "daubing five lines to spell out B-I-N-G-O";
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
    <div className="ticket rounded-xl p-7 text-center">
      <p className="script text-2xl text-dauber">Take your seats</p>
      <h2 className="signage mt-1 text-3xl text-ink">The hall is filling up</h2>
      <p className="mx-auto mt-3 max-w-md text-ink-soft">
        Share the session code so friends can grab a ticket. Players take turns picking a
        square and calling it — every call plays for the whole table. Win by{" "}
        {winPatternBlurb(winPattern)}.
      </p>
      <div className="mt-6">
        {isHost ? (
          <Button size="lg" onClick={onStart} disabled={playerCount < 1}>
            Eyes down — start the game
          </Button>
        ) : (
          <p className="inline-flex items-center gap-2 font-semibold text-ink-soft">
            <Loader2 className="size-4 animate-spin" /> Waiting for the caller to start…
          </p>
        )}
      </div>
    </div>
  );
}

/** Slim line naming whose turn it is (shown only when it isn't yours). */
function TurnLine({
  turnPlayerName,
  isSelf,
}: {
  turnPlayerName: string | null;
  isSelf: boolean;
}) {
  return (
    <p className="text-center text-sm font-semibold text-cream/70">
      {turnPlayerName ? (
        <>
          Waiting for <span className="text-cream">{turnPlayerName}</span>
          {isSelf ? " (you)" : ""} to call…
        </>
      ) : (
        "Waiting for the next caller…"
      )}
    </p>
  );
}

/**
 * The calling card — a compact one-line strip showing the ball just called,
 * a few recent numbers and how many are left. Sits below the call button.
 */
function CallStrip({ room }: { room: RoomState }) {
  const recent = useMemo(() => room.calledNumbers.slice(-6).reverse(), [room.calledNumbers]);
  const current = room.currentNumber;
  return (
    <div className="mx-auto flex max-w-sm items-center gap-2 overflow-x-auto rounded-lg border border-felt-2 bg-felt-3 px-3 py-1.5">
      <span className="shrink-0 text-[0.55rem] font-bold uppercase tracking-[0.14em] text-cream/45">
        Now calling
      </span>
      {current ? (
        <span key={current} className="animate-ball-in shrink-0">
          <Ball n={current} size="sm" />
        </span>
      ) : (
        <span className="script shrink-0 text-brass-hi/80">eyes down…</span>
      )}
      {recent.length > 1 && (
        <span className="ticketnum shrink-0 text-xs tracking-wide text-cream/40">
          {recent.slice(1).join("  ")}
        </span>
      )}
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs font-semibold text-cream/60">
        {room.callsRemaining} left
      </span>
    </div>
  );
}

/** BINGO letter progress — a token lights up in brass for each completed line. */
function BingoProgress({ lines, goal }: { lines: number; goal: number }) {
  const won = Math.min(lines, goal);
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-1.5">
      <p className="script text-lg text-brass-hi/80">spell it out</p>
      <div className="flex items-center justify-center gap-2">
        {BINGO_LETTERS.map((letter, i) => (
          <span
            key={letter}
            className={cn(
              "signage flex size-9 items-center justify-center rounded-full text-lg transition-colors",
              i < won
                ? "bg-brass text-ink shadow-[0_1px_0_rgba(255,245,200,0.7)_inset,0_4px_8px_-3px_rgba(0,0,0,0.5)]"
                : "border-2 border-dashed border-cream/25 text-cream/30",
            )}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The big red carnival BINGO! button. Glows and pulses when a win is live. */
function BingoButton({ lit, onClick }: { lit: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "signage relative w-full rounded-xl border-2 border-brass py-3 text-3xl text-cream",
        "bg-gradient-to-b from-[#d8495b] to-[#9e2c3d]",
        "shadow-[0_5px_0_#7a2233,0_12px_20px_-6px_rgba(0,0,0,0.55)] transition-[transform,box-shadow]",
        "active:translate-y-[4px] active:shadow-[0_1px_0_#7a2233]",
        lit && "animate-pulse ring-4 ring-brass-hi/60",
      )}
    >
      BINGO!
    </button>
  );
}

/** Scatter of dauber-dot confetti — decorative, hidden under reduced motion. */
function Confetti() {
  const colors = ["#c33a4e", "#c9a227", "#1d4d37", "#f3e7c9", "#e6c65a"];
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        color: colors[i % colors.length],
        size: 6 + Math.round(Math.random() * 8),
        round: Math.random() > 0.4,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
          }}
        />
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
    <div className="ticket relative overflow-hidden rounded-xl p-6 text-center">
      <Confetti />
      <div className="relative">
        <span className="animate-stamp signage inline-block -rotate-6 rounded-lg border-4 border-dauber px-5 py-1 text-4xl text-dauber">
          BINGO!
        </span>
        <p className="mt-4 text-lg font-semibold text-ink">
          {iWon ? "The round is yours — nicely daubed." : `${winnerName} called it first.`}
        </p>
        {isHost && (
          <Button className="mt-4" onClick={onRestart}>
            Deal a fresh round
          </Button>
        )}
      </div>
    </div>
  );
}

/** Fixed toasts announcing rivals' B-I-N-G-O letters. */
function NoticeStack({ notices }: { notices: { id: number; text: string }[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {notices.map((n) => (
        <div
          key={n.id}
          className="ticket animate-deal max-w-xs rounded-lg px-4 py-2 text-center text-sm font-semibold text-ink shadow-[0_12px_28px_-10px_rgba(0,0,0,0.6)]"
        >
          📢 {n.text}
        </div>
      ))}
    </div>
  );
}

/** Five B-I-N-G-O pips; the first `lines` light up in brass. */
function LetterPips({ lines }: { lines: number }) {
  const done = Math.min(lines, 5);
  return (
    <span className="flex shrink-0 items-center gap-[3px]" title={`${done} of 5 letters`}>
      {BINGO_LETTERS.map((letter, i) => (
        <span
          key={letter}
          className={cn(
            "flex size-[15px] items-center justify-center rounded-full text-[0.5rem] font-bold leading-none",
            i < done ? "bg-brass text-ink" : "bg-[rgba(42,32,22,0.1)] text-ink/30",
          )}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

/** The table — who's playing, who's connected, who's the caller and who won. */
function PlayerList({
  players,
  selfId,
  winnerId,
  phase,
  winPattern,
}: {
  players: {
    id: string;
    name: string;
    isHost: boolean;
    connected: boolean;
    won: boolean;
    lines: number;
  }[];
  selfId: string;
  winnerId: string | null;
  phase: string;
  winPattern: string;
}) {
  return (
    <div className="ticket rounded-xl p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="script text-xl text-dauber">At the table</p>
        <span className="ticketnum text-sm font-bold text-ink-soft">{players.length}</span>
      </div>
      <ul className="divide-y divide-[rgba(42,32,22,0.14)]">
        {players.map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm",
              p.id === selfId && "bg-[rgba(42,32,22,0.06)]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  p.connected ? "bg-felt-3" : "bg-ink/25",
                )}
                title={p.connected ? "at the table" : "stepped away"}
              />
              <span className="truncate font-semibold text-ink">
                {p.name}
                {p.id === selfId && <span className="font-normal text-ink-soft"> (you)</span>}
              </span>
              {p.isHost && (
                <span title="Caller" className="inline-flex items-center gap-0.5">
                  <Crown className="size-3.5 shrink-0 text-brass-2" />
                </span>
              )}
            </span>
            {phase === "finished" && p.id === winnerId ? (
              <Badge className="shrink-0 text-[0.6rem]">Winner</Badge>
            ) : winPattern === "bingo" && phase !== "lobby" ? (
              <LetterPips lines={p.lines} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
