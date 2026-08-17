import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ExpenseManagement,
  NewExpenseDialog,
} from "@/components/purchasing/expense-management";
import { OperationsNav } from "@/components/purchasing/operations-nav";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
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
    <PageContainer>
      <OperationsNav tenantSlug={tenantSlug} current="/expenses" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail="Only approved expenses enter operational reports"
      />
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
              <Input
                name="q"
                defaultValue={query.q}
                placeholder="Search vendor, category, number…"
              />
              <SelectField
                ariaLabel="Expense status"
                name="status"
                defaultValue={query.status}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "submitted", label: "Submitted" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                ]}
              />
              <SelectField
                ariaLabel="Expense store"
                name="store"
                defaultValue={query.store}
                options={[
                  { value: "all", label: "All stores" },
                  ...reference.stores.map((store) => ({
                    value: store.id,
                    label: store.name,
                  })),
                ]}
              />
              <Button type="submit">Apply</Button>
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
    </PageContainer>
  );
}
