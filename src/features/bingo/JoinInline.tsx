import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { joinRoom, saveIdentity } from "./client";

/**
 * Shown when a visitor opens a room link but has no stored identity for it —
 * they pick a name and join. On success we reload so the room view can
 * bootstrap cleanly from the freshly-saved identity.
 */
export function JoinInline({ code }: { code: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await joinRoom(code, name.trim() || "Player");
      saveIdentity(code, { playerId: result.you.id, token: result.you.token });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <div className="ticket rounded-xl p-6">
        <p className="script text-xl text-dauber">Take a seat</p>
        <h1 className="signage mt-1 text-2xl text-ink">
          Session <span className="text-dauber-2">{code}</span>
        </h1>
        <p className="mt-1 text-sm text-ink-soft">Pick a name and grab a ticket.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="join-name">Your name</Label>
            <Input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ama"
              maxLength={24}
              autoFocus
            />
          </div>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Joining…" : "Take a seat"}
          </Button>
        </form>
      </div>
    </div>
  );
}
