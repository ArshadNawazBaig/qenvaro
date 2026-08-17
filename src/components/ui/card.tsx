import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "bg-card text-card-foreground min-w-0 overflow-hidden rounded-2xl border border-border/70 shadow-[var(--shadow-card)]",
  {
    variants: {
      variant: {
        default: "",
        elevated: "shadow-[var(--shadow-float)]",
        muted: "bg-muted/70 shadow-none",
        outline: "bg-transparent shadow-none",
        interactive:
          "transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[var(--shadow-float)]",
        primary:
          "border-primary bg-primary text-primary-foreground shadow-[0_18px_40px_oklch(0.55_0.245_272/0.24)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}
export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "border-border/65 grid auto-rows-min grid-cols-1 items-start gap-1.5 border-b px-5 py-5 has-[>[data-slot=card-action]]:grid-cols-[minmax(0,1fr)_auto] sm:px-6 sm:py-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardAction({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-slot="card-title"
      className={cn(
        "col-start-1 row-start-1 text-[15px] font-semibold tracking-[-0.02em]",
        className,
      )}
      {...props}
    />
  );
}
export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="card-description"
      className={cn(
        "text-muted-foreground col-start-1 row-start-2 text-xs leading-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-5 sm:p-6", className)}
      {...props}
    />
  );
}

export function CardList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-list"
      className={cn("divide-y", className)}
      {...props}
    />
  );
}

export function CardListItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-list-item"
      className={cn("px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2 border-t p-4 sm:px-6", className)}
      {...props}
    />
  );
}
