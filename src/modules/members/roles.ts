export const assignableMemberRoles = [
  "admin",
  "manager",
  "cashier",
  "inventory_manager",
  "hr_manager",
  "accountant",
  "employee",
  "viewer",
] as const;

export type AssignableMemberRole = (typeof assignableMemberRoles)[number];

export const memberRoleLabels: Record<AssignableMemberRole | "owner", string> =
  {
    owner: "Owner",
    admin: "Administrator",
    manager: "Manager",
    cashier: "Cashier",
    inventory_manager: "Inventory manager",
    hr_manager: "HR manager",
    accountant: "Accountant",
    employee: "Employee",
    viewer: "Viewer",
  };

export function memberRoleLabel(role: string): string {
  return role in memberRoleLabels
    ? memberRoleLabels[role as keyof typeof memberRoleLabels]
    : role;
}
