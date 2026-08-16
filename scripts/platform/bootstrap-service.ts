import type { Db } from "mongodb";

type StringDocument = { _id: string } & Record<string, unknown>;

export interface SuperAdminBootstrapResult {
  configured: number;
  promoted: number;
  alreadyConfigured: number;
  missing: number;
  unverified: number;
}

function normalizedEmails(emails: Iterable<string>): string[] {
  return [...new Set([...emails].map((email) => email.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();
}

export async function bootstrapConfiguredSuperAdmins(
  database: Db,
  emails: Iterable<string>,
): Promise<SuperAdminBootstrapResult> {
  const configuredEmails = normalizedEmails(emails);
  if (configuredEmails.length === 0) {
    throw new Error(
      "SUPER_ADMIN_EMAILS must contain at least one configured account.",
    );
  }

  const result: SuperAdminBootstrapResult = {
    configured: configuredEmails.length,
    promoted: 0,
    alreadyConfigured: 0,
    missing: 0,
    unverified: 0,
  };

  for (const email of configuredEmails) {
    const user = await database
      .collection<{
        _id: string;
        email: string;
        emailVerified: boolean;
        role?: string;
      }>("user")
      .findOne(
        { email },
        { projection: { email: 1, emailVerified: 1, role: 1 } },
      );
    if (!user) {
      result.missing += 1;
      continue;
    }
    if (!user.emailVerified) {
      result.unverified += 1;
      continue;
    }
    if (
      (user.role ?? "user")
        .split(",")
        .map((role) => role.trim())
        .includes("PLATFORM_SUPER_ADMIN")
    ) {
      result.alreadyConfigured += 1;
      continue;
    }

    const userId = String(user._id);
    const idempotencyKey = `platform.super-admin.bootstrap:${userId}`;
    const now = new Date();
    await database.client.withSession(async (session) => {
      await session.withTransaction(async () => {
        const promoted = await database
          .collection<StringDocument>("user")
          .updateOne(
            { _id: user._id, emailVerified: true },
            {
              $set: {
                role: "PLATFORM_SUPER_ADMIN",
                updatedAt: now,
              },
            },
            { session },
          );
        if (promoted.matchedCount !== 1) {
          throw new Error("The configured account changed during bootstrap.");
        }
        await database
          .collection("session")
          .deleteMany({ userId }, { session });
        await database
          .collection<StringDocument>("platformAuditLogs")
          .updateOne(
            { idempotencyKey },
            {
              $setOnInsert: {
                _id: `paud_${crypto.randomUUID()}`,
                idempotencyKey,
                actorType: "server_bootstrap",
                actorId: "server_bootstrap",
                action: "platform.super_admin.bootstrapped",
                entityType: "user",
                entityId: userId,
                summary:
                  "Promoted a verified configured account and revoked its existing sessions.",
                createdAt: now,
              },
            },
            { session, upsert: true },
          );
      });
    });
    result.promoted += 1;
  }

  return result;
}
