import { z } from "zod";

export const customizablePermissions = [
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
] as const;

export type CustomizablePermission = (typeof customizablePermissions)[number];

const roleIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const baseSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(240),
    permissions: z
      .array(z.enum(customizablePermissions))
      .min(1)
      .max(customizablePermissions.length)
      .transform((items) => [...new Set(items)]),
  })
  .strict();

export const createCustomRoleSchema = baseSchema;
export const updateCustomRoleSchema = baseSchema.extend({
  roleId: roleIdSchema,
  expectedVersion: z.number().int().min(1),
});
export const archiveCustomRoleSchema = z
  .object({ roleId: roleIdSchema, expectedVersion: z.number().int().min(1) })
  .strict();
export const assignCustomRolesSchema = z
  .object({
    memberId: roleIdSchema,
    roleIds: z
      .array(roleIdSchema)
      .max(10)
      .transform((items) => [...new Set(items)]),
  })
  .strict();

export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>;
export type ArchiveCustomRoleInput = z.infer<typeof archiveCustomRoleSchema>;
export type AssignCustomRolesInput = z.infer<typeof assignCustomRolesSchema>;

export interface CustomRoleItem {
  id: string;
  name: string;
  description: string;
  permissions: CustomizablePermission[];
  version: number;
  assignedMembers: number;
}

export interface CustomRoleMember {
  id: string;
  name: string;
  email: string;
  baseRole: string;
  customRoleIds: string[];
}

export interface CustomRoleWorkspace {
  enabled: boolean;
  planName: string;
  roles: CustomRoleItem[];
  members: CustomRoleMember[];
}
