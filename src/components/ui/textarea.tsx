import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="textarea"
    className={cn(
      "border-input bg-card placeholder:text-muted-foreground hover:border-primary/20 focus-visible:border-primary/45 focus-visible:ring-primary/10 min-h-24 w-full resize-y rounded-xl border px-3.5 py-3 text-sm shadow-[var(--shadow-button)] transition-[border-color,box-shadow] focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
