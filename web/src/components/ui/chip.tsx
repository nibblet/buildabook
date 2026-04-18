"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [transition:background-color_120ms_cubic-bezier(0.2,0,0,1),color_120ms_cubic-bezier(0.2,0,0,1),border-color_120ms_cubic-bezier(0.2,0,0,1)]",
  {
    variants: {
      variant: {
        default:
          "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        active:
          "border-transparent bg-accent text-accent-foreground hover:bg-accent/80",
        primary:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
      },
      size: {
        default: "h-7 px-3 text-xs",
        lg: "h-9 px-4 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chipVariants> {
  active?: boolean;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, variant, size, active, ...props }, ref) => {
    const resolvedVariant = active ? "active" : (variant ?? "default");
    return (
      <button
        type="button"
        ref={ref}
        className={cn(chipVariants({ variant: resolvedVariant, size, className }))}
        {...props}
      />
    );
  },
);
Chip.displayName = "Chip";

export { Chip, chipVariants };
