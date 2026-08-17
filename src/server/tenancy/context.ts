import "server-only";
import type { Permission, TenantRole } from "@/modules/permissions/permissions";

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  sessionId: string;
  membershipId: string;
  roles: readonly TenantRole[];
  permissions: ReadonlySet<Permission>;
  allowedStoreIds: ReadonlySet<string>;
  activeStoreId: string | null;
  requestId: string;
}

export function assertStoreAccess(
  context: TenantContext,
  storeId: string,
): void {
  if (!context.allowedStoreIds.has(storeId)) {
    throw new TenantNotFoundError();
  }
}

export class TenantNotFoundError extends Error {
  constructor() {
    super("The requested resource was not found.");
    this.name = "TenantNotFoundError";
  }
}

export class TenantSuspendedError extends Error {
  constructor() {
    super("This business is suspended. Billing recovery remains available.");
    this.name = "TenantSuspendedError";
  }
}
