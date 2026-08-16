import { AlertTriangle, FileQuestion, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="bg-card flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
      <div className="bg-muted text-muted-foreground mb-4 flex size-11 items-center justify-center rounded-full">
        {icon}
      </div>
      <h2 className="font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function EmptyState() {
  return (
    <State
      icon={<FileQuestion className="size-5" />}
      title="No products match these filters"
      description="Clear a filter or add your first product to start building the catalog."
      action={<Button variant="outline">Clear filters</Button>}
    />
  );
}
export function ErrorState() {
  return (
    <State
      icon={<AlertTriangle className="size-5" />}
      title="We couldn't load this view"
      description="The issue may be temporary. Try again, and contact support if it continues."
      action={<Button variant="outline">Try again</Button>}
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
