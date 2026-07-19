export const PERMISSIONS = [
  // Value Stream Management (primary)
  "product.view",
  "product.create",
  "product.update",
  "product.archive",
  "project.create",
  "project.update",
  "feature.create",
  "feature.update",
  "task.create",
  "task.assign",
  "task.complete",
  "department.manage",
  "team.manage",
  "employee.manage",
  "users",
  "settings",
  // Legacy ops (kept for old pages / optional grants)
  "executive",
  "uiux",
  "engineering",
  "infrastructure",
  "marketing",
  "graph-view",
  "finance",
  "legalhr",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "product.view": "View products",
  "product.create": "Create products",
  "product.update": "Update products & pipelines",
  "product.archive": "Archive products",
  "project.create": "Create projects",
  "project.update": "Update projects",
  "feature.create": "Create features",
  "feature.update": "Update features",
  "task.create": "Create tasks",
  "task.assign": "Assign tasks",
  "task.complete": "Complete tasks",
  "department.manage": "Manage departments",
  "team.manage": "Manage teams",
  "employee.manage": "Manage employees",
  users: "User Management",
  settings: "Settings & Credentials",
  executive: "Legacy · Executive",
  uiux: "Legacy · UI/UX",
  engineering: "Legacy · Engineering",
  infrastructure: "Legacy · Infrastructure",
  marketing: "Legacy · Marketing",
  "graph-view": "Legacy · Graph",
  finance: "Legacy · Finance",
  legalhr: "Legacy · Legal & HR",
};

/** Primary permissions shown first in admin UI. */
export const VSM_PERMISSIONS: Permission[] = [
  "product.view",
  "product.create",
  "product.update",
  "product.archive",
  "project.create",
  "project.update",
  "feature.create",
  "feature.update",
  "task.create",
  "task.assign",
  "task.complete",
  "department.manage",
  "team.manage",
  "employee.manage",
  "users",
];

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
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "platform_admin" || normalized === "super_admin";
}
