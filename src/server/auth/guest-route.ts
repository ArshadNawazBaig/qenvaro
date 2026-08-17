import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { findFirstWorkspaceForUser } from "@/modules/tenants/onboarding-service";
import { auth } from "@/server/auth/auth";

export async function redirectAuthenticatedUserFromGuestRoute(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;

  const workspace = await findFirstWorkspaceForUser(session.user.id);
  redirect(workspace ? `/app/${workspace.tenantSlug}` : "/onboarding");
}
