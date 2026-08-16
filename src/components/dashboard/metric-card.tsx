import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "muted";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary ring-primary/10",
    success: "bg-success/30 text-success-foreground ring-success/20",
    warning: "bg-warning/30 text-warning-foreground ring-warning/20",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <Card className="group min-w-0">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.01em]">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tracking-[-0.035em] tabular-nums">
            {value}
          </p>
          <p className="text-muted-foreground mt-1.5 truncate text-xs">
            {detail}
          </p>
        </div>
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${tones[tone]}`}
        >
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}
