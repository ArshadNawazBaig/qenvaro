"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="bg-foreground/35 fixed inset-0 z-50 backdrop-blur-sm" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "bg-card border-border/70 fixed inset-x-3 top-3 z-50 max-h-[calc(100dvh-1.5rem)] w-auto max-w-lg overflow-y-auto overscroll-contain rounded-2xl border p-5 shadow-[var(--shadow-float)] sm:inset-x-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-6",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-4 right-4 rounded-lg p-1.5"
        aria-label="Close dialog"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;
