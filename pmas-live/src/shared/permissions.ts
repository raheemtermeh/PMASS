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
  "chat.view",
  "chat.send",
  "chat.create_channel",
  "chat.manage_channel",
  "chat.moderate",
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
  "chat.view": "View Chat",
  "chat.send": "Send Chat Messages",
  "chat.create_channel": "Create Channels",
  "chat.manage_channel": "Manage Channels",
  "chat.moderate": "Moderate Chat",
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

const PERMISSION_LABEL_KEYS: Record<Permission, string> = {
  "product.view": "permissions.actions.viewProducts",
  "product.create": "permissions.actions.createProducts",
  "product.update": "permissions.actions.updateProducts",
  "product.archive": "permissions.actions.archiveProducts",
  "project.create": "permissions.actions.createProjects",
  "project.update": "permissions.actions.updateProjects",
  "feature.create": "permissions.actions.createFeatures",
  "feature.update": "permissions.actions.updateFeatures",
  "task.create": "permissions.actions.createTasks",
  "task.assign": "permissions.actions.assignTasks",
  "task.complete": "permissions.actions.completeTasks",
  "department.manage": "permissions.actions.manageDepartments",
  "team.manage": "permissions.actions.manageTeams",
  "employee.manage": "permissions.actions.manageEmployees",
  "chat.view": "permissions.actions.chatView",
  "chat.send": "permissions.actions.chatSend",
  "chat.create_channel": "permissions.actions.chatCreateChannel",
  "chat.manage_channel": "permissions.actions.chatManageChannel",
  "chat.moderate": "permissions.actions.chatModerate",
  users: "permissions.actions.manageUsers",
  settings: "permissions.actions.manageSettings",
  executive: "permissions.actions.legacyExecutive",
  uiux: "permissions.actions.legacyUiux",
  engineering: "permissions.actions.legacyEngineering",
  infrastructure: "permissions.actions.legacyInfrastructure",
  marketing: "permissions.actions.legacyMarketing",
  "graph-view": "permissions.actions.legacyGraph",
  finance: "permissions.actions.legacyFinance",
  legalhr: "permissions.actions.legacyLegalHr",
};

/** Translation key for a permission label; safe for use by client or server modules. */
export function permissionLabelKey(permission: Permission): string {
  return PERMISSION_LABEL_KEYS[permission];
}

export type PermissionCategory = {
  id: string;
  label: string;
  permissions: Permission[];
};

export function permissionCategoryLabelKey(categoryID: string): string {
  return `permissions.categories.${categoryID}`;
}

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
    id: "chat",
    label: "Messenger",
    permissions: [
      "chat.view",
      "chat.send",
      "chat.create_channel",
      "chat.manage_channel",
      "chat.moderate",
    ],
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
