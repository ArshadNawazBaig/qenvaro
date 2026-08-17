import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformAuditLog } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Platform audit log" };
export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const context = await requireVerifiedPlatformContext();
  const query = await searchParams;
  const data = await getPlatformAuditLog(context, query.page);
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        title="Platform audit log"
        description="Append-only control-plane history for tenant, billing, support, flag, and announcement operations."
        actions={
          <Badge variant="outline">{data.total.toLocaleString()} events</Badge>
        }
      />
      {data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <History className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No platform audit events</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {data.items.map((item) => (
            <article
              key={item.id}
              className="bg-card grid gap-3 border-b p-5 last:border-b-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)]"
            >
              <div>
                <p className="font-mono text-xs font-semibold">{item.action}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {item.entityType} · {item.entityId}
                </p>
              </div>
              <div>
                <p className="text-sm">{item.summary}</p>
                {item.reason && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Reason: {item.reason}
                  </p>
                )}
              </div>
              <div className="text-xs">
                <p>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(item.createdAt))}
                </p>
                <p className="text-muted-foreground mt-1 font-mono">
                  {item.requestId}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
      {data.pages > 1 && (
        <div className="flex justify-end gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`?page=${Math.max(1, data.page - 1)}`}>Previous</Link>
          </Button>
          <Badge variant="outline">
            Page {data.page} of {data.pages}
          </Badge>
          <Button asChild size="sm" variant="outline">
            <Link href={`?page=${Math.min(data.pages, data.page + 1)}`}>
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
