import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ExpenseManagement,
  NewExpenseDialog,
} from "@/components/purchasing/expense-management";
import { OperationsNav } from "@/components/purchasing/operations-nav";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import {
  demoExpenses,
  demoPurchasingReference,
} from "@/modules/purchasing/demo-data";
import {
  expenseListQuerySchema,
  type PurchasingReferenceData,
} from "@/modules/purchasing/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { PurchasingRepository } from "@/server/repositories/purchasing";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const query = expenseListQuerySchema.parse(await searchParams);
  const filtered = demoExpenses.filter(
    (expense) =>
      (query.status === "all" || expense.status === query.status) &&
      (query.store === "all" || expense.storeId === query.store),
  );
  let result = { items: filtered, total: filtered.length };
  let reference: PurchasingReferenceData = demoPurchasingReference;
  let isDemo = true;
  let denied = false;
  let canCreate = false;
  let canApprove = false;
  if (tenantSlug !== "demo" && env.MONGODB_URI)
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "expense:read")) denied = true;
      else {
        const repository = new PurchasingRepository();
        [result, reference] = await Promise.all([
          repository.expenses(context, query),
          repository.expenseReferenceData(context),
        ]);
        canCreate = hasPermission(context.permissions, "expense:create");
        canApprove = hasPermission(context.permissions, "expense:approve");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <OperationsNav tenantSlug={tenantSlug} current="/expenses" />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          Only approved expenses enter operational reports
        </span>
      </div>
      <PageHeader
        eyebrow="Operations"
        title="Expenses"
        description="Submit, document, and approve store expenses with explicit reporting status."
        actions={
          <NewExpenseDialog
            tenantSlug={tenantSlug}
            reference={reference}
            disabled={
              isDemo || denied || !canCreate || reference.stores.length === 0
            }
          />
        }
      />
      {denied ? (
        <PermissionDenied />
      ) : (
        <Card>
          <CardContent className="border-b p-4">
            <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
              <input
                name="q"
                defaultValue={query.q}
                placeholder="Search vendor, category, number…"
                className="border-input bg-card min-h-10 rounded-lg border px-3 text-sm"
              />
              <select
                name="status"
                defaultValue={query.status}
                className="border-input bg-card min-h-10 rounded-lg border px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select
                name="store"
                defaultValue={query.store}
                className="border-input bg-card min-h-10 rounded-lg border px-3 text-sm"
              >
                <option value="all">All stores</option>
                {reference.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <button className="bg-primary text-primary-foreground rounded-lg px-4 text-sm font-medium">
                Apply
              </button>
            </form>
          </CardContent>
          <ExpenseManagement
            tenantSlug={tenantSlug}
            items={result.items}
            canApprove={canApprove}
            canUpload={canCreate}
            isDemo={isDemo}
          />
        </Card>
      )}
    </div>
  );
}
