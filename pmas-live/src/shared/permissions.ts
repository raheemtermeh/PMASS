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
  "product.view": "View",
  "product.create": "Create",
  "product.update": "Update",
  "product.archive": "Archive",
  "project.create": "Create",
  "project.update": "Update",
  "feature.create": "Create",
  "feature.update": "Update",
  "task.create": "Create",
  "task.assign": "Assign",
  "task.complete": "Complete",
  "department.manage": "Manage Departments",
  "team.manage": "Manage Teams",
  "employee.manage": "Manage Employees",
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

export type PermissionCategory = {
  id: string;
  label: string;
  permissions: Permission[];
};

/** Grouped permissions for User Management UI. */
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "products",
    label: "Products",
    permissions: ["product.view", "product.create", "product.update", "product.archive"],
  },
  {
    id: "projects",
    label: "Projects",
    permissions: ["project.create", "project.update"],
  },
  {
    id: "features",
    label: "Features",
    permissions: ["feature.create", "feature.update"],
  },
  {
    id: "tasks",
    label: "Tasks",
    permissions: ["task.create", "task.assign", "task.complete"],
  },
  {
    id: "organization",
    label: "Organization",
    permissions: ["team.manage", "department.manage", "employee.manage"],
  },
  {
    id: "administration",
    label: "Administration",
    permissions: ["users", "settings"],
  },
];

/** Primary permissions shown in admin UI (flat). */
export const VSM_PERMISSIONS: Permission[] = PERMISSION_CATEGORIES.flatMap((c) => c.permissions);

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
