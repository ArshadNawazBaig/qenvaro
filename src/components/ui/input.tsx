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
      "border-input bg-card placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-[0_1px_1px_rgb(30_24_18/0.02)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
