import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

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
    primary: "bg-primary/10 text-primary",
    success: "bg-success/30 text-success-foreground",
    warning: "bg-warning/30 text-warning-foreground",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {detail}
          </p>
        </div>
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          <Icon className="size-4" />
        </div>
      </div>
    </Card>
  );
}
