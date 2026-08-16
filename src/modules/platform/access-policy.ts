export const PLATFORM_SUPER_ADMIN_ROLE = "PLATFORM_SUPER_ADMIN" as const;

export type PlatformAccessDecision =
  | "deny"
  | "require_two_factor_enrollment"
  | "require_two_factor_verification"
  | "allow";

export function hasPlatformSuperAdminRole(role: unknown): boolean {
  const roles = Array.isArray(role) ? role : typeof role === "string" ? role.split(",") : [];
  return roles
    .map((value) => String(value).trim())
    .includes(PLATFORM_SUPER_ADMIN_ROLE);
}

export function evaluatePlatformAccess(input: {
  role: unknown;
  twoFactorEnabled: boolean;
  sessionAssured: boolean;
}): PlatformAccessDecision {
  if (!hasPlatformSuperAdminRole(input.role)) return "deny";
  if (!input.twoFactorEnabled) return "require_two_factor_enrollment";
  if (!input.sessionAssured) return "require_two_factor_verification";
  return "allow";
}
