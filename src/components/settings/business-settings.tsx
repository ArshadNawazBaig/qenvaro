"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  updateBusinessSettingsAction,
  updateOperationSettingsAction,
} from "@/app/app/[tenantSlug]/settings/business/actions";
import {
  SettingsActionMessage,
  settingsInitialState,
} from "@/components/settings/action-message";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TenantSettingsProjection } from "@/modules/settings/schemas";

function useSettingsAction(state: typeof settingsInitialState) {
  const router = useRouter();
  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    }
  }, [router, state]);
}

export function BusinessSettings({
  tenantSlug,
  settings,
  canManage,
  isDemo,
}: {
  tenantSlug: string;
  settings: TenantSettingsProjection;
  canManage: boolean;
  isDemo: boolean;
}) {
  const [businessState, businessAction, businessPending] = React.useActionState(
    updateBusinessSettingsAction.bind(null, tenantSlug),
    settingsInitialState,
  );
  const [operationsState, operationsAction, operationsPending] =
    React.useActionState(
      updateOperationSettingsAction.bind(null, tenantSlug),
      settingsInitialState,
    );
  useSettingsAction(businessState);
  useSettingsAction(operationsState);
  const disabled = isDemo || !canManage;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>
            Shared organization identity and regional defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={businessAction} className="grid gap-4 sm:grid-cols-2">
            <input
              type="hidden"
              name="expectedVersion"
              value={settings.version}
            />
            <label className="space-y-1.5 text-sm font-medium">
              Business name
              <Input
                name="businessName"
                required
                defaultValue={settings.businessName}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Legal name
              <Input
                name="legalName"
                defaultValue={settings.legalName}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Support email
              <Input
                name="supportEmail"
                type="email"
                defaultValue={settings.supportEmail}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Phone
              <Input
                name="phone"
                type="tel"
                defaultValue={settings.phone}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Business address
              <Textarea
                name="address"
                maxLength={500}
                rows={3}
                defaultValue={settings.address}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Locale
              <Input
                name="locale"
                required
                defaultValue={settings.locale}
                disabled={disabled}
                placeholder="en-PK"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Timezone
              <Input
                name="timezone"
                required
                defaultValue={settings.timezone}
                disabled={disabled}
                placeholder="Asia/Karachi"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Currency
              <Input
                name="currency"
                required
                minLength={3}
                maxLength={3}
                defaultValue={settings.currency}
                disabled={disabled}
                className="uppercase"
              />
            </label>
            <div className="sm:col-span-2">
              <SettingsActionMessage state={businessState} />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={disabled || businessPending}>
                <Save />
                {businessPending ? "Saving…" : "Save business profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tax, numbering & inventory</CardTitle>
          <CardDescription>
            Operational defaults applied by server-side workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={operationsAction} className="grid gap-4 sm:grid-cols-2">
            <input
              type="hidden"
              name="expectedVersion"
              value={settings.operationSettings.version}
            />
            <label className="space-y-1.5 text-sm font-medium">
              Default tax rate (%)
              <Input
                name="defaultTaxPercent"
                type="number"
                min={0}
                max={1000}
                step="0.01"
                defaultValue={(
                  settings.operationSettings.defaultTaxRateBps / 100
                ).toFixed(2)}
                disabled={disabled}
              />
            </label>
            <label className="flex min-h-10 items-center gap-3 self-end rounded-lg border px-3 text-sm font-medium">
              <input
                type="checkbox"
                name="pricesIncludeTax"
                defaultChecked={settings.operationSettings.pricesIncludeTax}
                disabled={disabled}
                className="accent-primary size-4"
              />
              Prices include tax
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Sale prefix
              <Input
                name="receiptPrefix"
                required
                defaultValue={settings.operationSettings.receiptPrefix}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Return prefix
              <Input
                name="returnPrefix"
                required
                defaultValue={settings.operationSettings.returnPrefix}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Purchase prefix
              <Input
                name="purchasePrefix"
                required
                defaultValue={settings.operationSettings.purchasePrefix}
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Expense prefix
              <Input
                name="expensePrefix"
                required
                defaultValue={settings.operationSettings.expensePrefix}
                disabled={disabled}
              />
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-lg border px-3 text-sm font-medium sm:col-span-2">
              <input
                type="checkbox"
                name="allowNegativeStock"
                defaultChecked={settings.operationSettings.allowNegativeStock}
                disabled={disabled}
                className="accent-primary size-4"
              />
              <span>
                Allow negative stock
                <span className="text-muted-foreground block text-xs font-normal">
                  Disabled by default. Enabling affects future sale validation.
                </span>
              </span>
            </label>
            <div className="sm:col-span-2">
              <SettingsActionMessage state={operationsState} />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={disabled || operationsPending}>
                <Save />
                {operationsPending ? "Saving…" : "Save operational policy"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
