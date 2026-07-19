import { cn } from "@/utils";
import { BINGO_LETTERS } from "./types";

interface BingoCardProps {
  card: number[];
  calledSet: Set<number>;
  winningLine?: number[] | null;
  /** Dim the whole ticket (e.g. once someone else has won). */
  dimmed?: boolean;
  /**
   * When true, this player is the caller: un-daubed (non-free) squares become
   * tappable so they can pick one to call. Picking is tentative — nothing is
   * committed until the caller confirms with the Call button.
   */
  callable?: boolean;
  /** Index of the square the caller has tentatively picked (not yet called). */
  selectedCell?: number | null;
  /** Tap handler for an un-daubed square while callable — toggles the pending pick. */
  onSelectCell?: (index: number) => void;
}

// Hand-painted masthead: letters alternate in the hall's signage colours.
const LETTER_COLORS = ["#c33a4e", "#2a2016", "#1d4d37", "#a8801c", "#c33a4e"];

/**
 * A player's bingo ticket. Called numbers get an ink-dauber blot; the winning
 * line, once it lands, is ringed in brass. On the player's turn (`callable`)
 * un-daubed squares become buttons; tapping one marks it as the pending pick
 * (a stable, movable selection) which the caller confirms elsewhere.
 */
export function BingoCard({
  card,
  calledSet,
  winningLine,
  dimmed,
  callable,
  selectedCell,
  onSelectCell,
}: BingoCardProps) {
  const winners = new Set(winningLine ?? []);
  return (
    <div
      className={cn(
        "ticket mx-auto w-full max-w-sm select-none rounded-xl p-3.5 transition-opacity",
        dimmed && "opacity-55",
      )}
    >
      {/* Ticket masthead */}
      <div className="mb-2.5 grid grid-cols-5 border-b-2 border-dashed border-[rgba(42,32,22,0.35)] pb-2">
        {BINGO_LETTERS.map((letter, i) => (
          <div
            key={letter}
            className="signage text-center text-[1.7rem] leading-none"
            style={{ color: LETTER_COLORS[i] }}
          >
            {letter}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1">
        {card.map((n, i) => {
          const free = n === 0;
          const daubed = free || calledSet.has(n);
          const inWin = winners.has(i);
          const tappable = callable && !daubed;
          const isSelected = tappable && selectedCell === i;
          // Deterministic per-square jitter so no two daubs sit identically.
          const rot = ((i * 37) % 15) - 7;

          const inner = (
            <div
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-md transition-colors",
                inWin && "bg-brass/25 ring-2 ring-brass",
                tappable && !isSelected && "hover:bg-[rgba(195,58,78,0.1)]",
                isSelected &&
                  "outline-2 outline-dashed outline-offset-[-3px] outline-dauber bg-[rgba(195,58,78,0.08)]",
              )}
            >
              {free ? (
                <span className="script text-lg text-dauber">free</span>
              ) : (
                <>
                  <span
                    className={cn(
                      "ticketnum text-xl font-bold",
                      daubed && !inWin ? "text-[#4a160f]" : "text-ink",
                    )}
                  >
                    {n}
                  </span>
                  {daubed && !inWin && (
                    <span
                      aria-hidden
                      className="daub animate-daub pointer-events-none absolute inset-[3px]"
                      style={{ ["--daub-rot" as string]: `${rot}deg` }}
                    />
                  )}
                </>
              )}
            </div>
          );

          if (tappable) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectCell?.(i)}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? "Selected" : "Pick"} ${n}`}
                className="rounded-md"
              >
                {inner}
              </button>
            );
          }
          return <div key={i}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
