"use client";

import {
  ArrowRight,
  CalendarClock,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import * as React from "react";
import {
  cancelSubscriptionAction,
  openBillingPortalAction,
  restoreSubscriptionAction,
  startCheckoutAction,
} from "@/app/app/[tenantSlug]/settings/billing/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { plans, type PlanKey } from "@/config/plans";
import type { BillingActionState } from "@/modules/billing/schemas";

const initialState: BillingActionState = { status: "idle", message: "" };

function ActionMessage({ state }: { state: BillingActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "text-destructive mt-2 text-xs"
          : "text-success-foreground mt-2 text-xs"
      }
    >
      {state.message}
    </p>
  );
}

export function BillingPlanPicker({
  tenantSlug,
  currentPlan,
  currentInterval,
  canManage,
  configuredPlans,
}: {
  tenantSlug: string;
  currentPlan: PlanKey;
  currentInterval: string | null;
  canManage: boolean;
  configuredPlans: Record<
    "starter" | "growth" | "business",
    { monthly: boolean; annual: boolean }
  >;
}) {
  const [interval, setInterval] = React.useState<"monthly" | "annual">(
    currentInterval === "year" ? "annual" : "monthly",
  );
  return (
    <div className="space-y-5">
      <div
        className="bg-muted inline-flex rounded-lg p-1"
        aria-label="Billing interval"
      >
        {(["monthly", "annual"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setInterval(value)}
            aria-pressed={interval === value}
            className={
              interval === value
                ? "bg-card rounded-md px-3 py-1.5 text-sm font-medium shadow-sm"
                : "text-muted-foreground rounded-md px-3 py-1.5 text-sm"
            }
          >
            {value === "monthly" ? "Monthly" : "Annual · save 17%"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <PlanCheckoutCard
          tenantSlug={tenantSlug}
          plan="starter"
          name={plans.starter.name}
          description={plans.starter.description}
          monthlyPrice={plans.starter.monthlyPriceMinor! / 100}
          annualPrice={plans.starter.annualPriceMinor! / 100}
          highlights={[
            `${plans.starter.limits.stores} store`,
            `${plans.starter.limits.members} team members`,
            `${plans.starter.limits.products?.toLocaleString()} products`,
          ]}
          interval={interval}
          current={currentPlan === "starter"}
          canManage={canManage}
          configured={configuredPlans.starter[interval]}
        />
        <PlanCheckoutCard
          tenantSlug={tenantSlug}
          plan="growth"
          name={plans.growth.name}
          description={plans.growth.description}
          monthlyPrice={plans.growth.monthlyPriceMinor! / 100}
          annualPrice={plans.growth.annualPriceMinor! / 100}
          highlights={[
            `${plans.growth.limits.stores} stores`,
            `${plans.growth.limits.members} team members`,
            `${plans.growth.limits.products?.toLocaleString()} products`,
          ]}
          interval={interval}
          current={currentPlan === "growth"}
          canManage={canManage}
          configured={configuredPlans.growth[interval]}
          featured
        />
        <PlanCheckoutCard
          tenantSlug={tenantSlug}
          plan="business"
          name={plans.business.name}
          description={plans.business.description}
          monthlyPrice={plans.business.monthlyPriceMinor! / 100}
          annualPrice={plans.business.annualPriceMinor! / 100}
          highlights={[
            `${plans.business.limits.stores} stores`,
            `${plans.business.limits.members} team members`,
            `${plans.business.limits.products?.toLocaleString()} products`,
          ]}
          interval={interval}
          current={currentPlan === "business"}
          canManage={canManage}
          configured={configuredPlans.business[interval]}
        />
      </div>
    </div>
  );
}

function PlanCheckoutCard({
  tenantSlug,
  plan,
  name,
  description,
  monthlyPrice,
  annualPrice,
  highlights,
  interval,
  current,
  canManage,
  configured,
  featured = false,
}: {
  tenantSlug: string;
  plan: "starter" | "growth" | "business";
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  highlights: string[];
  interval: "monthly" | "annual";
  current: boolean;
  canManage: boolean;
  configured: boolean;
  featured?: boolean;
}) {
  const [state, action, pending] = React.useActionState(
    startCheckoutAction.bind(null, tenantSlug),
    initialState,
  );
  const price = interval === "monthly" ? monthlyPrice : annualPrice;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription className="min-h-10">{description}</CardDescription>
        {(current || featured) && (
          <CardAction>
            <Badge variant={current ? "success" : "info"}>
              {current ? "Current" : "Recommended"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <p>
          <span className="text-3xl font-semibold">
            ${price.toLocaleString()}
          </span>
          <span className="text-muted-foreground text-sm">
            /{interval === "monthly" ? "month" : "year"}
          </span>
        </p>
        <ul className="text-muted-foreground my-5 space-y-2 text-sm">
          {highlights.map((highlight) => (
            <li key={highlight} className="flex items-center gap-2">
              <span className="bg-success size-1.5 rounded-full" /> {highlight}
            </li>
          ))}
        </ul>
        <form action={action}>
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="interval" value={interval} />
          <Button
            type="submit"
            variant={featured ? "default" : "outline"}
            className="w-full"
            disabled={!canManage || !configured || pending}
          >
            {pending
              ? "Opening Stripe…"
              : current
                ? "Change billing interval"
                : `Choose ${name}`}
            <ArrowRight />
          </Button>
        </form>
        {!configured && (
          <p className="text-muted-foreground mt-2 text-center text-xs">
            Stripe price not configured
          </p>
        )}
        <ActionMessage state={state} />
      </CardContent>
    </Card>
  );
}

export function BillingManagementActions({
  tenantSlug,
  canManage,
  providerEnabled,
  cancelAtPeriodEnd,
}: {
  tenantSlug: string;
  canManage: boolean;
  providerEnabled: boolean;
  cancelAtPeriodEnd: boolean;
}) {
  const [portalState, portalAction, portalPending] = React.useActionState(
    openBillingPortalAction.bind(null, tenantSlug),
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = React.useActionState(
    cancelSubscriptionAction.bind(null, tenantSlug),
    initialState,
  );
  const [restoreState, restoreAction, restorePending] = React.useActionState(
    restoreSubscriptionAction.bind(null, tenantSlug),
    initialState,
  );
  return (
    <div className="flex flex-wrap items-start gap-2">
      <form action={portalAction}>
        <Button
          type="submit"
          variant="outline"
          disabled={!canManage || !providerEnabled || portalPending}
        >
          <ExternalLink /> {portalPending ? "Opening…" : "Billing history"}
        </Button>
        <ActionMessage state={portalState} />
      </form>
      {cancelAtPeriodEnd ? (
        <form action={restoreAction}>
          <Button
            type="submit"
            variant="outline"
            disabled={!canManage || !providerEnabled || restorePending}
          >
            <RotateCcw />
            {restorePending ? "Restoring…" : "Keep subscription"}
          </Button>
          <ActionMessage state={restoreState} />
        </form>
      ) : (
        <form action={cancelAction}>
          <Button
            type="submit"
            variant="ghost"
            disabled={!canManage || !providerEnabled || cancelPending}
          >
            <CalendarClock />
            {cancelPending ? "Opening…" : "Cancel at period end"}
          </Button>
          <ActionMessage state={cancelState} />
        </form>
      )}
    </div>
  );
}
