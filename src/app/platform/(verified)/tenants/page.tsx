import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformTenants } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Platform tenants" };

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const context = await requireVerifiedPlatformContext();
  const query = await searchParams;
  const data = await getPlatformTenants(context, query);
  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        title="Tenants"
        description="Business metadata, verified entitlement posture, and bounded usage—never tenant transaction records."
        actions={
          <Badge variant="outline">{data.total.toLocaleString()} tenants</Badge>
        }
      />
      <form className="flex max-w-xl gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={data.q}
            placeholder="Search business name, slug, or tenant ID"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <Building2 className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No tenants found</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,.8fr)_minmax(0,.8fr)_minmax(0,1fr)_auto] gap-4 border-b px-5 py-3 text-xs font-semibold tracking-wider uppercase lg:grid">
            <span>Tenant</span>
            <span>Plan</span>
            <span>Status</span>
            <span>Usage</span>
            <span />
          </div>
          {data.items.map((tenant) => (
            <article
              key={tenant.tenantId}
              className="bg-card grid gap-3 border-b px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,.8fr)_minmax(0,.8fr)_minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{tenant.businessName}</p>
                <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
                  {tenant.slug} · {tenant.tenantId}
                </p>
              </div>
              <span className="text-sm">{tenant.planName}</span>
              <Badge
                variant={
                  tenant.billingStatus === "suspended"
                    ? "destructive"
                    : tenant.billingStatus === "active"
                      ? "success"
                      : "warning"
                }
                className="w-fit capitalize"
              >
                {tenant.billingStatus.replaceAll("_", " ")}
              </Badge>
              <p className="text-muted-foreground text-xs">
                {tenant.stores} stores · {tenant.members} members ·{" "}
                {tenant.products} products
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/platform/tenants/${tenant.tenantId}`}>
                  View metadata
                </Link>
              </Button>
            </article>
          ))}
        </div>
      )}
      {data.pages > 1 && (
        <div className="flex justify-end gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              href={`?q=${encodeURIComponent(data.q)}&page=${Math.max(1, data.page - 1)}`}
            >
              Previous
            </Link>
          </Button>
          <Badge variant="outline">
            Page {data.page} of {data.pages}
          </Badge>
          <Button asChild size="sm" variant="outline">
            <Link
              href={`?q=${encodeURIComponent(data.q)}&page=${Math.min(data.pages, data.page + 1)}`}
            >
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
