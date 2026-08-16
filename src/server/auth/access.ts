import "server-only";
import {
  defaultAc as adminDefaultAc,
  userAc,
} from "better-auth/plugins/admin/access";
import { defaultAc as organizationDefaultAc } from "better-auth/plugins/organization/access";

const orgOwner = organizationDefaultAc.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});
const orgAdmin = organizationDefaultAc.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["read"],
});
const orgMember = organizationDefaultAc.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
});

export const betterAuthOrganizationRoles = {
  owner: orgOwner,
  admin: orgAdmin,
  manager: orgMember,
  cashier: orgMember,
  inventory_manager: orgMember,
  hr_manager: orgMember,
  accountant: orgMember,
  employee: orgMember,
  viewer: orgMember,
};

const platformSuperAdmin = adminDefaultAc.newRole({
  user: ["create", "list", "ban", "delete", "get", "update"],
  session: ["list", "revoke", "delete"],
});

export const betterAuthPlatformRoles = {
  user: userAc,
  PLATFORM_SUPER_ADMIN: platformSuperAdmin,
};
export { adminDefaultAc, organizationDefaultAc };
