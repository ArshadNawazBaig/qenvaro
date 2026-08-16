import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  parentHref?: string;
}

export function PageHeader({
  eyebrow = "Workspace",
  title,
  description,
  actions,
  parentHref,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <nav
          className="text-muted-foreground mb-2 flex items-center gap-1 text-xs"
          aria-label="Breadcrumb"
        >
          {parentHref ? (
            <Link href={parentHref} className="hover:text-foreground">
              {eyebrow}
            </Link>
          ) : (
            <span>{eyebrow}</span>
          )}
          <ChevronRight className="size-3" />
          <span aria-current="page">{title}</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
