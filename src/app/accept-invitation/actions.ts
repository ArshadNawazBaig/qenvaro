"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { materializeInvitationStoreAssignments } from "@/modules/members/member-service";
import { auth } from "@/server/auth/auth";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";

export interface AcceptInvitationActionState {
  status: "idle" | "error";
  message: string;
}

const schema = z.object({
  invitationId: z.string().trim().min(3).max(128),
});

export async function acceptInvitationAction(
  _previous: AcceptInvitationActionState,
  formData: FormData,
): Promise<AcceptInvitationActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { status: "error", message: "This invitation link is incomplete." };
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session)
    return {
      status: "error",
      message: "Sign in with the invited email address, then try again.",
    };
  if (!session.user.emailVerified)
    return {
      status: "error",
      message: "Verify the invited email address before accepting.",
    };
  let targetSlug: string | undefined;
  try {
    const database = await getDatabase();
    const invitation = await database
      .collection<{
        _id: string;
        organizationId: string;
        email: string;
        status: string;
      }>("invitation")
      .findOne(
        {
          _id: parsed.data.invitationId,
          status: { $in: ["pending", "accepted"] },
          email: session.user.email.toLowerCase(),
        },
        { projection: { organizationId: 1, status: 1 } },
      );
    if (!invitation)
      return {
        status: "error",
        message:
          "This invitation is invalid, expired, or belongs to another email.",
      };
    let membershipId: string;
    if (invitation.status === "pending") {
      const accepted = await auth.api.acceptInvitation({
        headers: requestHeaders,
        body: { invitationId: parsed.data.invitationId },
      });
      membershipId = accepted.member.id;
    } else {
      const membership = await database
        .collection<{ _id: string }>("member")
        .findOne(
          {
            organizationId: invitation.organizationId,
            userId: session.user.id,
          },
          { projection: { _id: 1 } },
        );
      if (!membership)
        throw new Error("The accepted membership could not be verified.");
      membershipId = String(membership._id);
    }
    await materializeInvitationStoreAssignments(
      invitation.organizationId,
      parsed.data.invitationId,
      membershipId,
      session.user.id,
      requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
    );
    await auth.api.setActiveOrganization({
      headers: requestHeaders,
      body: { organizationId: invitation.organizationId },
    });
    const profile = await database
      .collection<{ slug: string }>("tenantProfiles")
      .findOne(
        { tenantId: invitation.organizationId },
        { projection: { slug: 1 } },
      );
    if (!profile) throw new Error("The invited workspace is not initialized.");
    targetSlug = profile.slug;
  } catch (error) {
    logger.warn({
      event: "tenant.member_invitation.accept_failed",
      invitationId: parsed.data.invitationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      status: "error",
      message:
        error instanceof APIError
          ? "Better Auth could not accept this invitation. It may have expired."
          : "We could not finish activating your store access. Try again.",
    };
  }
  redirect(`/app/${targetSlug}`);
}
