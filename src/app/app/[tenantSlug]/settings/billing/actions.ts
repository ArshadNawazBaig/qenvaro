"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/config/env";
import { planKeySchema } from "@/config/plans";
import {
  isStripeBillingProviderEnabled,
  isStripePlanConfigured,
} from "@/modules/billing/config";
import {
  checkoutSchema,
  type BillingActionState,
} from "@/modules/billing/schemas";
import { requirePermission } from "@/modules/permissions/permissions";
import { auth } from "@/server/auth/auth";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const planRank = { starter: 0, growth: 1, business: 2 } as const;

function billingFailure(error: unknown): BillingActionState {
  if (error instanceof APIError)
    return {
      status: "error",
      message:
        error.status === "TOO_MANY_REQUESTS"
          ? "Too many billing requests. Wait a moment and try again."
          : "Stripe could not start that billing operation.",
    };
  logger.warn({
    event: "tenant.billing_action.failed",
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return {
    status: "error",
    message: "Billing is temporarily unavailable. Try again later.",
  };
}

function verifiedRedirectUrl(value: string | null): string {
  if (!value) throw new Error("Stripe did not return a redirect URL.");
  const url = new URL(value, env.NEXT_PUBLIC_APP_URL);
  const appOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  const stripeHost =
    url.protocol === "https:" &&
    (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"));
  if (url.origin !== appOrigin && !stripeHost)
    throw new Error("Stripe returned an untrusted redirect URL.");
  return url.toString();
}

async function requireBillingManager(tenantSlug: string) {
  const context = await requireTenantContext(tenantSlug);
  requirePermission(context.permissions, "billing:manage");
  return context;
}

export async function startCheckoutAction(
  tenantSlug: string,
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { status: "error", message: "Choose a valid plan and interval." };
  const annual = parsed.data.interval === "annual";
  if (!isStripePlanConfigured(parsed.data.plan, annual))
    return {
      status: "error",
      message: "This plan interval is not configured for Stripe Checkout.",
    };
  let redirectUrl: string | undefined;
  try {
    const context = await requireBillingManager(tenantSlug);
    const database = await getDatabase();
    const [profile, subscription] = await Promise.all([
      database
        .collection<{ planKey: string }>("tenantProfiles")
        .findOne(
          { tenantId: context.tenantId },
          { projection: { planKey: 1 } },
        ),
      database.collection("subscription").findOne(
        {
          referenceId: context.tenantId,
          stripeSubscriptionId: { $type: "string" },
          status: { $in: ["active", "trialing"] },
        },
        { projection: { _id: 1 } },
      ),
    ]);
    if (!profile) throw new Error("Tenant billing profile is missing.");
    const currentPlan = planKeySchema.parse(profile.planKey);
    const scheduleAtPeriodEnd =
      Boolean(subscription) &&
      currentPlan !== "enterprise" &&
      planRank[parsed.data.plan] < planRank[currentPlan];
    const returnPath = `/app/${context.tenantSlug}/settings/billing`;
    const result = await auth.api.upgradeSubscription({
      headers: await headers(),
      body: {
        plan: parsed.data.plan,
        annual,
        referenceId: context.tenantId,
        customerType: "organization",
        successUrl: `${returnPath}?checkout=success`,
        cancelUrl: `${returnPath}?checkout=cancelled`,
        returnUrl: returnPath,
        scheduleAtPeriodEnd,
        disableRedirect: true,
      },
    });
    redirectUrl = verifiedRedirectUrl(result.url);
  } catch (error) {
    return billingFailure(error);
  }
  redirect(redirectUrl);
}

export async function openBillingPortalAction(
  tenantSlug: string,
  previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  void previous;
  void formData;
  if (!isStripeBillingProviderEnabled())
    return { status: "error", message: "Stripe Billing is not configured." };
  let redirectUrl: string | undefined;
  try {
    const context = await requireBillingManager(tenantSlug);
    const result = await auth.api.createBillingPortal({
      headers: await headers(),
      body: {
        referenceId: context.tenantId,
        customerType: "organization",
        returnUrl: `/app/${context.tenantSlug}/settings/billing`,
        disableRedirect: true,
      },
    });
    redirectUrl = verifiedRedirectUrl(result.url);
  } catch (error) {
    return billingFailure(error);
  }
  redirect(redirectUrl);
}

export async function cancelSubscriptionAction(
  tenantSlug: string,
  previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  void previous;
  void formData;
  if (!isStripeBillingProviderEnabled())
    return { status: "error", message: "Stripe Billing is not configured." };
  let redirectUrl: string | undefined;
  try {
    const context = await requireBillingManager(tenantSlug);
    const result = await auth.api.cancelSubscription({
      headers: await headers(),
      body: {
        referenceId: context.tenantId,
        customerType: "organization",
        returnUrl: `/app/${context.tenantSlug}/settings/billing`,
        disableRedirect: true,
      },
    });
    redirectUrl = verifiedRedirectUrl(result.url);
  } catch (error) {
    return billingFailure(error);
  }
  redirect(redirectUrl);
}

export async function restoreSubscriptionAction(
  tenantSlug: string,
  previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  void previous;
  void formData;
  if (!isStripeBillingProviderEnabled())
    return { status: "error", message: "Stripe Billing is not configured." };
  try {
    const context = await requireBillingManager(tenantSlug);
    await auth.api.restoreSubscription({
      headers: await headers(),
      body: {
        referenceId: context.tenantId,
        customerType: "organization",
      },
    });
    revalidatePath(`/app/${context.tenantSlug}/settings/billing`);
    return {
      status: "success",
      message:
        "Cancellation reversal sent to Stripe. Access updates after webhook confirmation.",
    };
  } catch (error) {
    return billingFailure(error);
  }
}
