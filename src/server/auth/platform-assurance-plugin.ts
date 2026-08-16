import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import type { Db } from "mongodb";
import { hasPlatformSuperAdminRole } from "@/modules/platform/access-policy";

type ReturnedAuthResult = { token?: unknown; user?: { id?: unknown } };

async function readReturnedAuthResult(
  returned: unknown,
): Promise<ReturnedAuthResult | null> {
  if (returned instanceof Response) {
    if (!returned.ok) return null;
    return (await returned.clone().json()) as ReturnedAuthResult;
  }
  return returned && typeof returned === "object"
    ? (returned as ReturnedAuthResult)
    : null;
}

export function platformSessionAssurancePlugin(
  database: Db,
): BetterAuthPlugin {
  return {
    id: "platform-session-assurance",
    hooks: {
      after: [
        {
          matcher: ({ path }) =>
            path === "/sign-in/email" ||
            path === "/two-factor/verify-totp" ||
            path === "/two-factor/verify-backup-code",
          handler: createAuthMiddleware(async (context) => {
            try {
              const returned = await readReturnedAuthResult(
                context.context.returned,
              );
              const newSession = context.context.newSession;
              const token =
                newSession?.session.token ??
                (typeof returned?.token === "string" ? returned.token : null);
              if (!token) return;
              const session = await database
                .collection<{
                  _id: string;
                  userId: string;
                  expiresAt: Date;
                }>("session")
                .findOne(
                  { token },
                  { projection: { userId: 1, expiresAt: 1 } },
                );
              if (!session) return;
              const user = await database
                .collection<{
                  _id: string;
                  role?: string;
                  twoFactorEnabled?: boolean;
                }>("user")
                .findOne(
                  { _id: session.userId },
                  { projection: { role: 1, twoFactorEnabled: 1 } },
                );
              if (
                !user?.twoFactorEnabled ||
                !hasPlatformSuperAdminRole(user.role)
              )
                return;
              const now = new Date();
              await database
                .collection("platformSessionAssurances")
                .updateOne(
                  { sessionId: String(session._id) },
                  {
                    $set: {
                      userId: session.userId,
                      verifiedAt: now,
                      verifiedBy:
                        context.path === "/two-factor/verify-backup-code"
                          ? "backup_code"
                          : context.path === "/sign-in/email"
                            ? "trusted_device"
                            : "totp",
                      expiresAt: session.expiresAt,
                      updatedAt: now,
                    },
                    $setOnInsert: {
                      _id: `passure_${crypto.randomUUID()}`,
                      sessionId: String(session._id),
                      createdAt: now,
                    },
                  },
                  { upsert: true },
                );
            } catch (error) {
              context.context.logger.error(
                "Failed to persist platform session 2FA assurance",
                error,
              );
            }
          }),
        },
      ],
    },
  };
}
