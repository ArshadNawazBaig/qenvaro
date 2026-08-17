import * as React from "react";
import { cn } from "@/lib/utils";

export const selectClassName =
  "border-input bg-card text-foreground hover:border-primary/20 focus-visible:border-primary/45 focus-visible:ring-primary/10 flex h-10 w-full rounded-xl border px-3.5 text-sm shadow-[var(--shadow-button)] transition-[border-color,box-shadow] focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    data-slot="select"
    className={cn(selectClassName, className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
