import { z } from "zod";
import { assignableMemberRoles } from "./roles";

const storeIdsSchema = z
  .array(z.string().trim().min(3).max(128))
  .min(1, "Choose at least one store.")
  .transform((values) => [...new Set(values)]);

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(assignableMemberRoles),
  storeIds: storeIdsSchema,
});

export const updateMemberSchema = z.object({
  memberId: z.string().trim().min(3).max(128),
  role: z.enum(assignableMemberRoles),
  storeIds: storeIdsSchema,
});

export const memberTargetSchema = z.object({
  memberId: z.string().trim().min(3).max(128),
});

export const invitationTargetSchema = z.object({
  invitationId: z.string().trim().min(3).max(128),
});

export const transferOwnershipSchema = z
  .object({
    memberId: z.string().trim().min(3).max(128),
    confirmationEmail: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();
