export const resources = [
  "tenant",
  "billing",
  "store",
  "member",
  "product",
  "inventory",
  "customer",
  "sale",
  "supplier",
  "purchase",
  "employee",
  "compensation",
  "attendance",
  "payroll",
  "expense",
  "report",
  "audit",
  "settings",
] as const;
export type Resource = (typeof resources)[number];
export type Permission = `${Resource}:${string}`;

export const tenantRoles = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "INVENTORY_MANAGER",
  "HR_MANAGER",
  "ACCOUNTANT",
  "EMPLOYEE",
  "VIEWER",
] as const;
export type TenantRole = (typeof tenantRoles)[number];

const owner: Permission[] = [
  "tenant:read",
  "tenant:update",
  "tenant:delete",
  "tenant:transferOwnership",
  "billing:read",
  "billing:manage",
  "store:read",
  "store:create",
  "store:update",
  "store:archive",
  "member:read",
  "member:invite",
  "member:updateRole",
  "member:remove",
  "product:read",
  "product:create",
  "product:update",
  "product:archive",
  "product:import",
  "product:export",
  "inventory:read",
  "inventory:adjust",
  "inventory:transfer",
  "customer:read",
  "customer:create",
  "customer:update",
  "customer:archive",
  "sale:read",
  "sale:create",
  "sale:complete",
  "sale:void",
  "sale:refund",
  "supplier:read",
  "supplier:create",
  "supplier:update",
  "purchase:read",
  "purchase:create",
  "purchase:approve",
  "purchase:receive",
  "purchase:cancel",
  "employee:read",
  "employee:create",
  "employee:update",
  "employee:archive",
  "compensation:read",
  "compensation:manage",
  "attendance:read",
  "attendance:manage",
  "payroll:read",
  "payroll:prepare",
  "payroll:approve",
  "payroll:finalize",
  "expense:read",
  "expense:create",
  "expense:approve",
  "report:read",
  "report:export",
  "audit:read",
  "settings:read",
  "settings:manage",
];

export const rolePermissions: Record<TenantRole, ReadonlySet<Permission>> = {
  OWNER: new Set(owner),
  ADMIN: new Set(
    owner.filter(
      (permission) =>
        ![
          "tenant:delete",
          "tenant:transferOwnership",
          "billing:manage",
        ].includes(permission),
    ),
  ),
  MANAGER: new Set([
    "tenant:read",
    "store:read",
    "member:read",
    "product:read",
    "product:create",
    "product:update",
    "product:archive",
    "inventory:read",
    "inventory:adjust",
    "inventory:transfer",
    "customer:read",
    "customer:create",
    "customer:update",
    "sale:read",
    "sale:create",
    "sale:complete",
    "sale:refund",
    "supplier:read",
    "purchase:read",
    "employee:read",
    "attendance:read",
    "report:read",
  ]),
  CASHIER: new Set([
    "store:read",
    "product:read",
    "inventory:read",
    "customer:read",
    "customer:create",
    "sale:read",
    "sale:create",
    "sale:complete",
    "sale:refund",
  ]),
  INVENTORY_MANAGER: new Set([
    "store:read",
    "product:read",
    "product:create",
    "product:update",
    "product:archive",
    "product:import",
    "product:export",
    "inventory:read",
    "inventory:adjust",
    "inventory:transfer",
    "supplier:read",
    "supplier:create",
    "supplier:update",
    "purchase:read",
    "purchase:create",
    "purchase:receive",
  ]),
  HR_MANAGER: new Set([
    "store:read",
    "employee:read",
    "employee:create",
    "employee:update",
    "employee:archive",
    "compensation:read",
    "compensation:manage",
    "attendance:read",
    "attendance:manage",
    "payroll:read",
    "payroll:prepare",
  ]),
  ACCOUNTANT: new Set([
    "store:read",
    "expense:read",
    "expense:create",
    "expense:approve",
    "report:read",
    "report:export",
    "payroll:read",
    "payroll:approve",
    "audit:read",
  ]),
  EMPLOYEE: new Set([
    "store:read",
    "employee:readOwn",
    "attendance:readOwn",
    "attendance:createOwn",
    "payroll:readOwn",
  ]),
  VIEWER: new Set([
    "tenant:read",
    "store:read",
    "product:read",
    "inventory:read",
    "customer:read",
    "sale:read",
    "report:read",
  ]),
};

export function resolvePermissions(
  roles: readonly TenantRole[],
  custom: readonly Permission[] = [],
): ReadonlySet<Permission> {
  const permissions = new Set<Permission>(custom);
  for (const role of roles)
    for (const permission of rolePermissions[role]) permissions.add(permission);
  return permissions;
}

export function hasPermission(
  permissions: ReadonlySet<Permission>,
  permission: Permission,
): boolean {
  return permissions.has(permission);
}

export class PermissionError extends Error {
  constructor(public readonly permission: Permission) {
    super("You do not have permission to perform this action.");
    this.name = "PermissionError";
  }
}

export function requirePermission(
  permissions: ReadonlySet<Permission>,
  permission: Permission,
): void {
  if (!hasPermission(permissions, permission))
    throw new PermissionError(permission);
}
