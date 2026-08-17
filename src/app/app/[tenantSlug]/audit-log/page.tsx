import { History, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hasPermission } from "@/modules/permissions/permissions";
import { getAuditLog } from "@/server/repositories/governance";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const { tenantSlug } = await params;
  if (tenantSlug === "demo")
    return (
      <AuditView
        tenantSlug={tenantSlug}
        data={{
          enabled: false,
          planName: "Growth",
          items: [],
          page: 1,
          pages: 1,
          total: 0,
        }}
      />
    );
  const context = await requireTenantContext(tenantSlug).catch(() =>
    notFound(),
  );
  if (!hasPermission(context.permissions, "audit:read")) notFound();
  const query = await searchParams;
  const data = await getAuditLog(context, query);
  return <AuditView tenantSlug={tenantSlug} data={data} />;
}

function AuditView({
  tenantSlug,
  data,
}: {
  tenantSlug: string;
  data: Awaited<ReturnType<typeof getAuditLog>>;
}) {
  if (!data.enabled)
    return (
      <PageContainer size="narrow">
        <PageHeader
          eyebrow="Governance"
          title="Audit log"
          description="Review append-only records for sensitive business operations."
        />
        <Card className="flex flex-col items-center p-10 text-center">
          <ShieldCheck className="text-primary size-9" />
          <p className="mt-3 font-semibold">Advanced audit requires Business</p>
          <p className="text-muted-foreground mt-1 max-w-lg text-sm">
            Your {data.planName} plan still records sensitive audit events; the
            full searchable console is a Business feature.
          </p>
          <Button asChild className="mt-5">
            <Link href={`/app/${tenantSlug}/settings/billing`}>
              Compare plans
            </Link>
          </Button>
        </Card>
      </PageContainer>
    );
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Governance"
        title="Audit log"
        description="Append-only tenant history with safe summaries and request correlation."
        actions={
          <Badge variant="outline">{data.total.toLocaleString()} events</Badge>
        }
      />
      {data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <History className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No audit events found</p>
        </Card>
      ) : (
        <Card>
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] gap-4 border-b px-5 py-3 text-xs font-semibold tracking-wider uppercase lg:grid">
            <span>Action</span>
            <span>Summary</span>
            <span>Actor</span>
            <span>Time</span>
          </div>
          {data.items.map((item) => (
            <article
              key={item.id}
              className="bg-card grid gap-3 border-b px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center"
            >
              <div>
                <p className="font-mono text-xs font-semibold">{item.action}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {item.entityType} · {item.entityId}
                </p>
              </div>
              <p className="text-sm">{item.summary}</p>
              <div>
                <p className="text-sm font-medium">{item.actorName}</p>
                <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                  {item.requestId}
                </p>
              </div>
              <time
                className="text-muted-foreground text-xs"
                dateTime={item.createdAt}
              >
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.createdAt))}
              </time>
            </article>
          ))}
        </Card>
      )}
      {data.pages > 1 && (
        <div className="flex justify-end gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className={data.page <= 1 ? "pointer-events-none opacity-50" : ""}
          >
            <Link href={`?page=${Math.max(1, data.page - 1)}`}>Previous</Link>
          </Button>
          <Badge variant="outline">
            Page {data.page} of {data.pages}
          </Badge>
          <Button
            asChild
            size="sm"
            variant="outline"
            className={
              data.page >= data.pages ? "pointer-events-none opacity-50" : ""
            }
          >
            <Link href={`?page=${Math.min(data.pages, data.page + 1)}`}>
              Next
            </Link>
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
