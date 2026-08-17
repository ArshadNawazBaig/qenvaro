import { Archive, ContactRound, MailCheck, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CustomerManagement,
  NewCustomerDialog,
} from "@/components/customers/customer-management";
import { CustomerToolbar } from "@/components/customers/customer-toolbar";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import {
  getDemoCustomers,
  queryDemoCustomers,
} from "@/modules/customers/demo-data";
import {
  customerListQuerySchema,
  type CustomerListItem,
} from "@/modules/customers/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { CustomerRepository } from "@/server/repositories/customers";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const rawQuery = await searchParams;
  const query = customerListQuerySchema.parse(rawQuery);
  const demoCustomers = getDemoCustomers();
  let result: { items: CustomerListItem[]; total: number } =
    queryDemoCustomers(query);
  let metrics = {
    total: demoCustomers.length,
    active: demoCustomers.filter((customer) => customer.status === "active")
      .length,
    archived: demoCustomers.filter((customer) => customer.status === "archived")
      .length,
    reachable: demoCustomers.filter(
      (customer) => customer.email || customer.phone,
    ).length,
  };
  let isDemo = true;
  let permissionDenied = false;
  let canCreate = false;
  let canUpdate = false;
  let canArchive = false;

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "customer:read")) {
        permissionDenied = true;
        result = { items: [], total: 0 };
        metrics = { total: 0, active: 0, archived: 0, reachable: 0 };
      } else {
        const repository = new CustomerRepository();
        [result, metrics] = await Promise.all([
          repository.list(context, query),
          repository.metrics(context),
        ]);
        canCreate = hasPermission(context.permissions, "customer:create");
        canUpdate = hasPermission(context.permissions, "customer:update");
        canArchive = hasPermission(context.permissions, "customer:archive");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }

  const pageCount = Math.max(1, Math.ceil(result.total / query.pageSize));
  const page = Math.min(query.page, pageCount);

  return (
    <PageContainer>
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail={
          isDemo
            ? "Read-only customer-management preview"
            : "Customer access and tenant ownership verified server-side"
        }
      />
      <PageHeader
        eyebrow="Sales"
        title="Customers"
        description="Keep contact details and customer identity ready for every sale, without losing historical records."
        actions={
          <NewCustomerDialog
            tenantSlug={tenantSlug}
            disabled={isDemo || permissionDenied || !canCreate}
          />
        }
      />
      {!permissionDenied && (
        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Customer summary"
        >
          <MetricCard
            label="Total customers"
            value={metrics.total.toLocaleString()}
            detail="Active and historical"
            icon={ContactRound}
          />
          <MetricCard
            label="Active customers"
            value={metrics.active.toLocaleString()}
            detail="Available for new sales"
            icon={UserRoundCheck}
            tone="success"
          />
          <MetricCard
            label="Reachable"
            value={metrics.reachable.toLocaleString()}
            detail="Email or phone available"
            icon={MailCheck}
          />
          <MetricCard
            label="Archived"
            value={metrics.archived.toLocaleString()}
            detail="Retained for history"
            icon={Archive}
            tone="warning"
          />
        </section>
      )}
      {permissionDenied ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <ContactRound className="text-muted-foreground size-8" />
            <h2 className="mt-4 font-semibold">
              Customer access is restricted
            </h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
              Your current workspace role cannot view customer profiles. Ask an
              owner or administrator to update your role.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CustomerToolbar query={query} />
          <CustomerManagement
            tenantSlug={tenantSlug}
            items={result.items}
            page={page}
            pageCount={pageCount}
            total={result.total}
            canUpdate={canUpdate}
            canArchive={canArchive}
            isDemo={isDemo}
          />
        </Card>
      )}
    </PageContainer>
  );
}
