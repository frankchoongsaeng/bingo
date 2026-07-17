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

import { createRoom, joinRoom, saveIdentity } from "./client";
import type { WinPattern } from "./types";

type Pace = { label: string; ms: number };
const PACES: Pace[] = [
  { label: "Relaxed", ms: 5000 },
  { label: "Normal", ms: 3500 },
  { label: "Fast", ms: 2000 },
];

export function BingoHome() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"create" | "join">("create");

  // Create form
  const [hostName, setHostName] = useState("");
  const [winPattern, setWinPattern] = useState<WinPattern>("line");
  const [paceMs, setPaceMs] = useState(3500);

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
        callIntervalMs: paceMs,
      });
      saveIdentity(result.room.id, { playerId: result.you.id, token: result.you.token });
      navigate(`/room/${result.room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
      setBusy(false);
    }
  };

  const doJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Enter a room code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinRoom(code, joinName.trim() || "Player");
      saveIdentity(code, { playerId: result.you.id, token: result.you.token });
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Chota Bingo</h1>
        <p className="mt-2 text-muted-foreground">
          Spin up a room, share the code, and race your friends to a bingo — live, in real time.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={cn(
              "rounded-md py-2 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "create" ? "Create room" : "Join room"}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>Host a new game</CardTitle>
            <CardDescription>You'll get a room code to share with players.</CardDescription>
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
                <Label>Win pattern</Label>
                <div className="grid grid-cols-2 gap-2">
                  <OptionButton
                    active={winPattern === "line"}
                    title="Any line"
                    subtitle="Row, column or diagonal"
                    onClick={() => setWinPattern("line")}
                  />
                  <OptionButton
                    active={winPattern === "blackout"}
                    title="Blackout"
                    subtitle="Fill the whole card"
                    onClick={() => setWinPattern("blackout")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Calling pace</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PACES.map((p) => (
                    <OptionButton
                      key={p.ms}
                      active={paceMs === p.ms}
                      title={p.label}
                      subtitle={`${p.ms / 1000}s`}
                      onClick={() => setPaceMs(p.ms)}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating…" : "Create room"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Join a game</CardTitle>
            <CardDescription>Enter the room code a host shared with you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={doJoin} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="join-code">Room code</Label>
                <Input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCDE"
                  maxLength={5}
                  autoCapitalize="characters"
                  className="font-mono text-lg tracking-widest"
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

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Joining…" : "Join room"}
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
        "rounded-lg border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-accent",
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </button>
  );
}
