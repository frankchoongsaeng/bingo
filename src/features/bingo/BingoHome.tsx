import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/utils";

import { SoundToggle } from "./SoundToggle";
import { createRoom, joinRoom, saveIdentity } from "./client";
import type { WinPattern } from "./types";

const LOGO_BALLS = [
  { letter: "B", color: "#c33a4e" },
  { letter: "I", color: "#2a2016" },
  { letter: "N", color: "#1d4d37" },
  { letter: "G", color: "#a8801c" },
  { letter: "O", color: "#c33a4e" },
];

export function BingoHome() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"create" | "join">("create");

  // Create form
  const [hostName, setHostName] = useState("");
  const [winPattern, setWinPattern] = useState<WinPattern>("bingo");

  // Join form
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createRoom({
        playerName: hostName.trim() || "Host",
        winPattern,
      });
      saveIdentity(result.room.id, { playerId: result.you.id, token: result.you.token });
      navigate(`/room/${result.room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open a session");
      setBusy(false);
    }
  };

  const doJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Enter a session code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinRoom(code, joinName.trim() || "Player");
      saveIdentity(code, { playerId: result.you.id, token: result.you.token });
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the session");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <div className="flex justify-end">
        <SoundToggle />
      </div>
      <header className="-mt-4 mb-9 text-center">
        <p className="script text-2xl text-brass-hi">Welcome to</p>
        <div className="mt-3 flex justify-center gap-2 sm:gap-2.5">
          {LOGO_BALLS.map((b, i) => (
            <div
              key={b.letter}
              className="animate-ball-in shrink-0 rounded-full p-[3px]"
              style={{ background: b.color, animationDelay: `${i * 0.08}s` }}
            >
              <div className="ball flex size-12 items-center justify-center rounded-full sm:size-14">
                <span
                  className="signage text-2xl sm:text-3xl"
                  style={{ color: b.color }}
                >
                  {b.letter}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-5 max-w-sm text-cream/70">
          Grab a ticket, share the session code, and daub your way to a BINGO with friends —
          live, in real time.
        </p>
      </header>

      <div className="mx-auto mb-6 grid max-w-xs grid-cols-2 gap-1 rounded-lg border border-felt-2 bg-felt-2 p-1">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={cn(
              "rounded-md py-2 text-sm font-bold uppercase tracking-wide transition-colors",
              tab === t
                ? "bg-brass text-ink shadow-[0_1px_0_rgba(255,245,200,0.6)_inset]"
                : "text-cream/60 hover:text-cream",
            )}
          >
            {t === "create" ? "Host" : "Join"}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle className="signage text-2xl">Open a session</CardTitle>
            <CardDescription>You'll get a code to share with the table.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={doCreate} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="host-name">Your name</Label>
                <Input
                  id="host-name"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g. Kofi"
                  maxLength={24}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>How to win</Label>
                <div className="grid grid-cols-3 gap-2">
                  <OptionButton
                    active={winPattern === "bingo"}
                    title="BINGO"
                    subtitle="Spell it — 5 lines"
                    onClick={() => setWinPattern("bingo")}
                  />
                  <OptionButton
                    active={winPattern === "line"}
                    title="Any line"
                    subtitle="Row, col or diagonal"
                    onClick={() => setWinPattern("line")}
                  />
                  <OptionButton
                    active={winPattern === "blackout"}
                    title="Full house"
                    subtitle="Daub the whole card"
                    onClick={() => setWinPattern("blackout")}
                  />
                </div>
                <p className="text-xs text-ink-soft">
                  Players take turns picking a square to call — every call plays for the whole
                  table.
                </p>
              </div>

              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Opening…" : "Open the session"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="signage text-2xl">Join a session</CardTitle>
            <CardDescription>Enter the code the caller shared with you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={doJoin} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="join-code">Session code</Label>
                <Input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCDE"
                  maxLength={5}
                  autoCapitalize="characters"
                  className="ticketnum text-2xl font-bold tracking-[0.4em]"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join-name-2">Your name</Label>
                <Input
                  id="join-name-2"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="e.g. Ama"
                  maxLength={24}
                />
              </div>

              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Joining…" : "Take a seat"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OptionButton({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border-2 p-3 text-left transition-colors",
        active
          ? "border-brass bg-[rgba(201,162,39,0.16)]"
          : "border-[rgba(42,32,22,0.22)] hover:bg-cream-2",
      )}
    >
      <p className="font-bold text-ink">{title}</p>
      <p className="text-xs text-ink-soft">{subtitle}</p>
    </button>
  );
}
