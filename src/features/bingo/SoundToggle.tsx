import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isMuted, sfx, toggleMuted } from "./sound";

/** A speaker button that mutes/unmutes the game's sound effects. */
export function SoundToggle() {
  const [muted, setMuted] = useState(isMuted());
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound off" : "Sound on"}
      onClick={() => {
        const next = toggleMuted();
        setMuted(next);
        if (!next) sfx.click();
      }}
    >
      {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </Button>
  );
}
