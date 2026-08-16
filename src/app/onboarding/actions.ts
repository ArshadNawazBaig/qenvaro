"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { onboardingSchema } from "@/modules/tenants/onboarding-schema";
import {
  findFirstWorkspaceForUser,
  findOwnedOrganizationBySlug,
  OnboardingInvariantError,
  TenantOnboardingService,
} from "@/modules/tenants/onboarding-service";
import { auth } from "@/server/auth/auth";
import { logger } from "@/server/logging/logger";

export interface OnboardingActionState {
  status: "idle" | "error" | "success";
  message: string;
  tenantSlug?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof onboardingSchema>, string[]>
  >;
}

async function setActiveOrganization(
  requestHeaders: Headers,
  organizationId: string | null,
) {
  await auth.api.setActiveOrganization({
    headers: requestHeaders,
    body: { organizationId },
  });
}

async function compensateOrganization(
  requestHeaders: Headers,
  organizationId: string,
) {
  try {
    await setActiveOrganization(requestHeaders, null);
    await auth.api.deleteOrganization({
      headers: requestHeaders,
      body: { organizationId },
    });
  } catch {
    logger.error({
      event: "tenant.onboarding.compensation_failed",
      organizationId,
    });
  }
}

export async function completeOnboardingAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session)
    return {
      status: "error",
      message: "Your session expired. Sign in and try again.",
    };
  if (!session.user.emailVerified)
    return {
      status: "error",
      message: "Verify your email before creating a workspace.",
    };

  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      status: "error",
      message: "Review the highlighted setup fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };

  const existing = await findFirstWorkspaceForUser(session.user.id);
  if (existing) {
    await setActiveOrganization(requestHeaders, existing.tenantId);
    redirect(`/app/${existing.tenantSlug}`);
  }

  let organization = await findOwnedOrganizationBySlug(
    session.user.id,
    parsed.data.businessSlug,
  );
  let createdOrganization = false;
  let stage = "organization.create";
  let completedTenantSlug: string | undefined;
  try {
    if (!organization) {
      organization = await auth.api.createOrganization({
        headers: requestHeaders,
        body: {
          name: parsed.data.businessName,
          slug: parsed.data.businessSlug,
          metadata: { onboardingVersion: 1 },
        },
      });
      createdOrganization = true;
    }
    if (!organization)
      throw new Error("Organization creation did not complete.");
    const activeOrganization = organization;
    stage = "organization.set_active";
    await setActiveOrganization(requestHeaders, activeOrganization.id);
    stage = "workspace.initialize";
    const result = await new TenantOnboardingService().initialize(
      {
        tenantId: activeOrganization.id,
        userId: session.user.id,
        requestId: requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
      },
      parsed.data,
    );
    completedTenantSlug = result.tenantSlug;
  } catch (error) {
    if (createdOrganization && organization)
      await compensateOrganization(requestHeaders, organization.id);
    if (
      error instanceof APIError &&
      /organization (already exists|slug already taken)/i.test(error.message)
    )
      return {
        status: "error",
        message: "That workspace URL is unavailable.",
        fieldErrors: {
          businessSlug: ["Choose a different workspace URL."],
        },
      };
    logger.warn({
      event: "tenant.onboarding.failed",
      userId: session.user.id,
      stage,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorReason:
        error instanceof OnboardingInvariantError ? error.reason : undefined,
    });
    return {
      status: "error",
      message:
        error instanceof OnboardingInvariantError
          ? "Workspace identity verification failed. No partial workspace was kept."
          : "We could not finish setup. No partial workspace was kept.",
    };
  }
  redirect(`/app/${completedTenantSlug}`);
}
