import type * as React from "react";
import { cn } from "@/lib/utils";

const sizes = {
  compact: "max-w-4xl",
  narrow: "max-w-[1200px]",
  default: "max-w-[1480px]",
  wide: "max-w-[1680px]",
} as const;

export function PageContainer({
  size = "default",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  size?: keyof typeof sizes;
}) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        "mx-auto w-full space-y-5 p-4 sm:space-y-6 sm:p-6 lg:p-7 xl:p-8",
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PageStatus({
  tone,
  label,
  detail,
}: {
  tone: "live" | "demo" | "restricted";
  label: string;
  detail: React.ReactNode;
}) {
  const colors = {
    live: "bg-success text-success-foreground",
    demo: "bg-warning text-warning-foreground",
    restricted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold",
          colors[tone],
        )}
      >
        <span className="size-1.5 rounded-full bg-current opacity-75" />
        {label}
      </span>
      <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 truncate">
        {detail}
      </span>
    </div>
  );
}

export function SectionGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("grid min-w-0 gap-4", className)} {...props} />;
}
