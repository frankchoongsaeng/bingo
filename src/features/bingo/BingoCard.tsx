import { cn } from "@/utils";
import { BINGO_LETTERS } from "./types";

interface BingoCardProps {
  card: number[];
  calledSet: Set<number>;
  winningLine?: number[] | null;
  /** Dim the whole card (e.g. once someone else has won). */
  dimmed?: boolean;
  /**
   * When true, this player is the caller: uncalled (non-free) cells become
   * tappable and clicking one calls that number for everyone via `onCall`.
   */
  callable?: boolean;
  onCall?: (n: number) => void;
}

/**
 * A player's 5x5 bingo card. Called numbers auto-daub and the winning line, if
 * any, is highlighted. On the player's turn (`callable`), uncalled cells turn
 * into buttons that call their number.
 */
export function BingoCard({ card, calledSet, winningLine, dimmed, callable, onCall }: BingoCardProps) {
  const winners = new Set(winningLine ?? []);
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-sm select-none rounded-xl border bg-card p-3 shadow-sm transition-opacity",
        dimmed && "opacity-60",
      )}
    >
      <div className="mb-2 grid grid-cols-5 gap-1.5">
        {BINGO_LETTERS.map((letter) => (
          <div
            key={letter}
            className="flex h-9 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-foreground"
          >
            {letter}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {card.map((n, i) => {
          const free = n === 0;
          const daubed = free || calledSet.has(n);
          const inWin = winners.has(i);
          const tappable = callable && !daubed;
          const className = cn(
            "flex aspect-square items-center justify-center rounded-md border text-lg font-semibold tabular-nums transition-colors",
            !daubed && "bg-background text-foreground",
            daubed && !inWin && "border-primary/40 bg-primary/15 text-primary",
            inWin && "border-primary bg-primary text-primary-foreground",
            tappable && "cursor-pointer hover:border-primary hover:bg-primary/10 hover:text-primary",
          );
          const content = free ? (
            <span className="text-xs font-bold uppercase tracking-wide">Free</span>
          ) : (
            <span className="relative">
              {n}
              {daubed && !inWin && (
                <span className="pointer-events-none absolute inset-0 -m-1.5 rounded-full ring-2 ring-primary/50" />
              )}
            </span>
          );
          if (tappable) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCall?.(n)}
                aria-label={`Call ${n}`}
                className={className}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={i} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
