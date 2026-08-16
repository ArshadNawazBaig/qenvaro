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
      "border-input bg-card placeholder:text-muted-foreground flex h-10 w-full rounded-lg border px-3 py-1 text-sm shadow-[var(--shadow-button)] transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
