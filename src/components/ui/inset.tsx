import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const insetVariants = cva("min-w-0 rounded-xl border border-border/70", {
  variants: {
    variant: {
      default: "bg-workspace/60",
      surface: "bg-card",
      muted: "bg-muted/60",
      dashed: "bg-muted/35 border-dashed",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface InsetProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof insetVariants> {}

export function Inset({ className, variant, ...props }: InsetProps) {
  return (
    <div
      data-slot="inset"
      className={cn(insetVariants({ variant }), className)}
      {...props}
    />
  );
}
