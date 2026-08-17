import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "border-input bg-card placeholder:text-muted-foreground hover:border-primary/20 focus-visible:border-primary/45 focus-visible:ring-primary/10 flex h-10 w-full rounded-xl border px-3.5 py-1 text-sm shadow-[var(--shadow-button)] transition-[border-color,box-shadow,background-color] focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
