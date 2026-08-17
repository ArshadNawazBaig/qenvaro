import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClassName =
  "border-input bg-card text-foreground placeholder:text-muted-foreground hover:border-primary/20 focus-visible:border-primary/45 focus-visible:ring-primary/8 flex h-9 w-full rounded-md border px-3 py-1 text-sm font-normal shadow-none transition-[border-color,box-shadow,background-color] focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(inputClassName, className)}
    {...props}
  />
));
Input.displayName = "Input";
