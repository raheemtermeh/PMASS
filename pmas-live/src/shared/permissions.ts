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
  "product.create",
  "product.update",
  "product.archive",
  "product.view",
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
  "product.create": "Create Products",
  "product.update": "Update Products",
  "product.archive": "Archive Products",
  "product.view": "View Products",
  "project.create": "Create Projects",
  "project.update": "Update Projects",
  "feature.create": "Create Features",
  "feature.update": "Update Features",
  "task.create": "Create Tasks",
  "task.assign": "Assign Tasks",
  "task.complete": "Complete Tasks",
  "department.manage": "Manage Departments",
  "team.manage": "Manage Teams",
  "employee.manage": "Manage Employees",
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
