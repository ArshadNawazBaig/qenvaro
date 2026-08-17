import "server-only";
import { planKeySchema, plans } from "@/config/plans";
import { requirePermission } from "@/modules/permissions/permissions";
import type {
  CustomRoleWorkspace,
  CustomizablePermission,
} from "@/modules/roles/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

export async function getCustomRoleWorkspace(
  context: TenantContext,
): Promise<CustomRoleWorkspace> {
  requirePermission(context.permissions, "settings:read");
  const database = await getDatabase();
  const profile = await database
    .collection<{ planKey: string }>("tenantProfiles")
    .findOne({ tenantId: context.tenantId }, { projection: { planKey: 1 } });
  if (!profile) throw new Error("Tenant profile is unavailable.");
  const plan = plans[planKeySchema.parse(profile.planKey)];
  const [roles, memberships, assignments] = await Promise.all([
    database
      .collection<{
        _id: string;
        name: string;
        description?: string;
        permissions: CustomizablePermission[];
        version: number;
      }>("customRoleDefinitions")
      .find(
        { tenantId: context.tenantId, status: "active" },
        { projection: { name: 1, description: 1, permissions: 1, version: 1 } },
      )
      .sort({ name: 1, _id: 1 })
      .limit(25)
      .toArray(),
    database
      .collection<{ _id: string; userId: string; role: string }>("member")
      .find(
        { organizationId: context.tenantId },
        { projection: { userId: 1, role: 1 } },
      )
      .limit(100)
      .toArray(),
    database
      .collection<{ membershipId: string; roleId: string }>(
        "memberCustomRoleAssignments",
      )
      .find(
        { tenantId: context.tenantId },
        { projection: { membershipId: 1, roleId: 1 } },
      )
      .limit(1000)
      .toArray(),
  ]);
  const users = await database
    .collection<{ _id: string; name: string; email: string }>("user")
    .find(
      { _id: { $in: memberships.map((member) => member.userId) } },
      { projection: { name: 1, email: 1 } },
    )
    .toArray();
  const userMap = new Map(users.map((user) => [user._id, user]));
  const byMember = new Map<string, string[]>();
  const roleCounts = new Map<string, number>();
  for (const assignment of assignments) {
    const current = byMember.get(assignment.membershipId) ?? [];
    current.push(assignment.roleId);
    byMember.set(assignment.membershipId, current);
    roleCounts.set(
      assignment.roleId,
      (roleCounts.get(assignment.roleId) ?? 0) + 1,
    );
  }
  return {
    enabled: plan.features.has("customRoles"),
    planName: plan.name,
    roles: roles.map((role) => ({
      id: role._id,
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions,
      version: role.version,
      assignedMembers: roleCounts.get(role._id) ?? 0,
    })),
    members: memberships
      .flatMap((member) => {
        const user = userMap.get(member.userId);
        return user
          ? [
              {
                id: member._id,
                name: user.name,
                email: user.email,
                baseRole: member.role,
                customRoleIds: byMember.get(member._id) ?? [],
              },
            ]
          : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
