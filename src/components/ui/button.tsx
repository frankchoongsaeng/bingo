import { ComponentProps } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold tracking-wide disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Raised brass plaque — the primary tactile control.
        default: "plaque",
        // Enamel danger button, still tactile.
        destructive:
          "bg-destructive text-destructive-foreground border border-[rgba(70,14,10,0.5)] shadow-[0_4px_0_#7a2019,0_9px_16px_-6px_rgba(0,0,0,0.5)] active:translate-y-[3px] active:shadow-[0_1px_0_#7a2019] transition-[transform,box-shadow] duration-75",
        // Cream ticket button with printed ink border.
        outline:
          "bg-cream text-ink border-2 border-[rgba(42,32,22,0.75)] shadow-[0_3px_0_rgba(42,32,22,0.25)] hover:bg-cream-2 active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow,background-color] duration-75",
        secondary:
          "bg-cream-2 text-ink border border-[rgba(42,32,22,0.35)] shadow-[0_3px_0_rgba(42,32,22,0.18)] hover:brightness-95 active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow] duration-75",
        ghost: "text-foreground hover:bg-[rgba(255,250,235,0.1)]",
        link: "text-brass-hi underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-sm",
        lg: "h-12 rounded-lg px-7 text-base has-[>svg]:px-5",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
