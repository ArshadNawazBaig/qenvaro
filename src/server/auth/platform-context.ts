import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { getDatabase } from "@/server/db/client";
import {
  evaluatePlatformAccess,
  hasPlatformSuperAdminRole,
  type PlatformAccessDecision,
} from "@/modules/platform/access-policy";

export interface PlatformIdentity {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  sessionAssured: boolean;
  access: Exclude<PlatformAccessDecision, "deny">;
  requestId: string;
}

export type VerifiedPlatformContext = PlatformIdentity & { access: "allow" };

export class PlatformNotFoundError extends Error {
  constructor() {
    super("The requested resource was not found.");
    this.name = "PlatformNotFoundError";
  }
}

export class PlatformTwoFactorRequiredError extends Error {
  constructor(
    public readonly reason:
      | "require_two_factor_enrollment"
      | "require_two_factor_verification",
  ) {
    super("Two-factor verification is required for platform access.");
    this.name = "PlatformTwoFactorRequiredError";
  }
}

export const requirePlatformIdentity = cache(
  async (): Promise<PlatformIdentity> => {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) throw new PlatformNotFoundError();
    const user = session.user as typeof session.user & {
      role?: string;
      twoFactorEnabled?: boolean;
    };
    if (!hasPlatformSuperAdminRole(user.role))
      throw new PlatformNotFoundError();
    const database = await getDatabase();
    const assurance = await database
      .collection("platformSessionAssurances")
      .findOne(
        {
          sessionId: session.session.id,
          userId: user.id,
          expiresAt: { $gt: new Date() },
        },
        { projection: { _id: 1 } },
      );
    const access = evaluatePlatformAccess({
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled === true,
      sessionAssured: Boolean(assurance),
    });
    if (access === "deny") throw new PlatformNotFoundError();
    return {
      userId: user.id,
      sessionId: session.session.id,
      name: user.name,
      email: user.email,
      role: user.role ?? "",
      twoFactorEnabled: user.twoFactorEnabled === true,
      sessionAssured: Boolean(assurance),
      access,
      requestId: requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
    };
  },
);

export const requireVerifiedPlatformContext = cache(
  async (): Promise<VerifiedPlatformContext> => {
    const identity = await requirePlatformIdentity();
    if (identity.access !== "allow")
      throw new PlatformTwoFactorRequiredError(identity.access);
    return { ...identity, access: "allow" };
  },
);
