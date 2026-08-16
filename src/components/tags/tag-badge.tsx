import { Badge } from "@/components/ui/badge";
import type { TagColor } from "@/modules/tags/schemas";

const tagDotColors: Record<TagColor, string> = {
  slate: "bg-muted-foreground",
  blue: "bg-primary",
  emerald: "bg-success-foreground",
  amber: "bg-warning-foreground",
  violet: "bg-chart-3",
  rose: "bg-destructive",
};

export function TagBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: TagColor;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={className}>
      <span className={`size-1.5 rounded-full ${tagDotColors[color]}`} />
      {name}
    </Badge>
  );
}
