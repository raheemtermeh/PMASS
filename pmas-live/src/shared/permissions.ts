export const PERMISSIONS = [
  "executive",
  "uiux",
  "engineering",
  "infrastructure",
  "marketing",
  "graph-view",
  "finance",
  "legalhr",
  "settings",
  "users",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  executive: "Executive Control",
  uiux: "UI/UX Design",
  engineering: "Engineering",
  infrastructure: "Infrastructure",
  marketing: "Marketing",
  "graph-view": "Graph Network",
  finance: "Finance",
  legalhr: "Legal & HR",
  settings: "Settings & Credentials",
  users: "User Management",
};

export function hasPermission(
  role: string,
  permissions: string[],
  required: Permission,
): boolean {
  if (role === "platform_admin" || role === "super_admin" || role === "tenant_admin") {
    return true;
  }
  return permissions.includes(required);
}

export function isPlatformRole(role: string | undefined | null): boolean {
  return role === "platform_admin" || role === "super_admin";
}
