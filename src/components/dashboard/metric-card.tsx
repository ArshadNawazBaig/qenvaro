import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "primary",
  emphasis = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "muted";
  emphasis?: boolean;
  className?: string;
}) {
  const tones = {
    primary: "bg-primary text-primary-foreground shadow-[var(--shadow-button)]",
    success: "bg-success/55 text-success-foreground",
    warning: "bg-warning/50 text-warning-foreground",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <Card
      className={cn("group relative min-w-0", className)}
      variant={emphasis ? "primary" : "interactive"}
    >
      <CardContent className="flex min-h-36 items-start justify-between gap-4 p-5 sm:p-5">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-semibold tracking-[0.04em] uppercase",
              emphasis ? "text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <p className="mt-3 text-[1.7rem] leading-none font-semibold tracking-[-0.045em] tabular-nums">
            {value}
          </p>
          <div
            className={cn(
              "mt-2 min-h-8 text-xs leading-4",
              emphasis ? "text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {detail}
          </div>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            emphasis ? "bg-primary-foreground text-primary" : tones[tone],
          )}
        >
          <Icon className="size-[18px]" />
        </div>
      </CardContent>
    </Card>
  );
}
