import { AlertTriangle, FileQuestion, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function State({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card variant="muted" className="border-dashed">
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <div className="bg-card text-primary mb-4 flex size-12 items-center justify-center rounded-2xl shadow-[var(--shadow-button)]">
          {icon}
        </div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          {description}
        </p>
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  );
}
export function EmptyState({ action }: { action?: React.ReactNode }) {
  return (
    <State
      icon={<FileQuestion className="size-5" />}
      title="No products match these filters"
      description="Clear a filter or add your first product to start building the catalog."
      action={action}
    />
  );
}
export function ErrorState({
  title = "We couldn't load this view",
  description = "The issue may be temporary. Try again, and contact support if it continues.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <State
      icon={<AlertTriangle className="size-5" />}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
export function PermissionDenied() {
  return (
    <State
      icon={<LockKeyhole className="size-5" />}
      title="You don't have access"
      description="Ask a business administrator for the product:read permission."
    />
  );
}
