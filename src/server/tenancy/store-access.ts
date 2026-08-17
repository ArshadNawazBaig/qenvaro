export function hasAllStoreAccess(
  roles: readonly string[],
  explicitAssignmentCount: number,
): boolean {
  const normalizedRoles = roles.map((role) => role.trim().toUpperCase());
  return (
    normalizedRoles.includes("OWNER") ||
    (normalizedRoles.includes("ADMIN") && explicitAssignmentCount === 0)
  );
}
