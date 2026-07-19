import { ComponentProps } from "react"

import { cn } from "@/utils"

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "text-ink placeholder:text-ink-soft/70 selection:bg-dauber selection:text-cream flex h-11 w-full min-w-0 rounded-md border-2 border-[rgba(42,32,22,0.55)] bg-[rgba(255,252,244,0.75)] px-3 py-1 text-base shadow-[inset_0_2px_4px_rgba(42,32,22,0.12)] transition-[color,box-shadow,border-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-brass focus-visible:ring-2 focus-visible:ring-brass/40",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
