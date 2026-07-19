import { isPlatformRole, type Permission } from "./permissions";

export type ViewId =
  | "home"
  | "organization"
  | "products"
  | "planning"
  | "profile"
  | "admin-users"
  | "platform-tenants"
  | "platform-access-requests"
  | "settings"
  // Legacy ops (pages remain; not in primary nav)
  | "executive"
  | "uiux"
  | "engineering"
  | "infrastructure"
  | "marketing"
  | "graph-view"
  | "finance"
  | "legalhr"
  | "product-manager";

export interface RouteConfig {
  id: ViewId;
  path: string;
  title: string;
  subtitle: string;
  permission: Permission | null;
  platformOnly?: boolean;
  tenantOnly?: boolean;
}

export const routes: Record<ViewId, RouteConfig> = {
  home: {
    id: "home",
    path: "/home",
    title: "Command Center",
    subtitle: "Products, tasks, workflows, and activity at a glance",
    permission: null,
    tenantOnly: true,
  },
  organization: {
    id: "organization",
    path: "/organization",
    title: "Organization",
    subtitle: "Company structure — departments, teams, and employees",
    permission: "employee.manage",
    tenantOnly: true,
  },
  products: {
    id: "products",
    path: "/products",
    title: "Products",
    subtitle: "Product aggregate — pipeline, stages, and execution",
    permission: "product.view",
    tenantOnly: true,
  },
  planning: {
    id: "planning",
    path: "/planning",
    title: "Planning",
    subtitle: "Projects → Features → Tasks under each Product",
    permission: "project.create",
    tenantOnly: true,
  },
  profile: {
    id: "profile",
    path: "/profile",
    title: "Profile",
    subtitle: "Your identity, contact details, and account security",
    permission: null,
  },
  "admin-users": {
    id: "admin-users",
    path: "/admin/users",
    title: "User Management",
    subtitle: "Invite users and assign VSM permissions",
    permission: "users",
    tenantOnly: true,
  },
  "platform-tenants": {
    id: "platform-tenants",
    path: "/platform/tenants",
    title: "Add Company",
    subtitle: "Create a company workspace with Company ID and admin credentials",
    permission: null,
    platformOnly: true,
  },
  "platform-access-requests": {
    id: "platform-access-requests",
    path: "/platform/access-requests",
    title: "Membership Requests",
    subtitle: "Review landing-page signup requests and issue credentials",
    permission: null,
    platformOnly: true,
  },
  settings: {
    id: "settings",
    path: "/settings",
    title: "System Settings",
    subtitle: "Integration credentials vault",
    permission: "settings",
    tenantOnly: true,
  },
  // Legacy
  "product-manager": {
    id: "product-manager",
    path: "/product-manager",
    title: "Capability Map",
    subtitle: "Playbooks filtered by your access",
    permission: null,
  },
  executive: {
    id: "executive",
    path: "/executive",
    title: "Executive Control Room",
    subtitle: "Legacy ops telemetry",
    permission: "executive",
    tenantOnly: true,
  },
  uiux: {
    id: "uiux",
    path: "/uiux",
    title: "UI/UX Workspace",
    subtitle: "Legacy design workspace",
    permission: "uiux",
    tenantOnly: true,
  },
  engineering: {
    id: "engineering",
    path: "/engineering",
    title: "Engineering Core Platform",
    subtitle: "Legacy engineering ops",
    permission: "engineering",
    tenantOnly: true,
  },
  infrastructure: {
    id: "infrastructure",
    path: "/infrastructure",
    title: "Infrastructure Gateway",
    subtitle: "Legacy infra telemetry",
    permission: "infrastructure",
    tenantOnly: true,
  },
  marketing: {
    id: "marketing",
    path: "/marketing",
    title: "Marketing Workspace",
    subtitle: "Legacy marketing ops",
    permission: "marketing",
    tenantOnly: true,
  },
  "graph-view": {
    id: "graph-view",
    path: "/graph-view",
    title: "Network Topology",
    subtitle: "Legacy dependency graph",
    permission: "graph-view",
    tenantOnly: true,
  },
  finance: {
    id: "finance",
    path: "/finance",
    title: "Finance Telemetry",
    subtitle: "Legacy finance ops",
    permission: "finance",
    tenantOnly: true,
  },
  legalhr: {
    id: "legalhr",
    path: "/legalhr",
    title: "Legal & HR Compliance",
    subtitle: "Legacy compliance ops",
    permission: "legalhr",
    tenantOnly: true,
  },
};

/** Tenant company workspace navigation. */
export const tenantNavItems: ViewId[] = [
  "home",
  "organization",
  "products",
  "planning",
  "profile",
  "admin-users",
  "settings",
];

/** Platform admin navigation — isolated from tenant workspace. */
export const platformNavItems: ViewId[] = [
  "platform-tenants",
  "platform-access-requests",
  "profile",
];

export interface PlatformNavGroup {
  label: string;
  items: ViewId[];
}

/** Grouped platform sidebar sections. */
export const platformNavGroups: PlatformNavGroup[] = [
  {
    label: "Company management",
    items: ["platform-tenants", "platform-access-requests"],
  },
  {
    label: "Account",
    items: ["profile"],
  },
];

/** @deprecated Use tenantNavItems or platformNavItems */
export const navItems: ViewId[] = [
  ...tenantNavItems,
  ...platformNavItems.filter((id) => id !== "profile"),
];

export function getRouteByPath(pathname: string): RouteConfig | null {
  const exact = Object.values(routes).find((route) => route.path === pathname);
  if (exact) return exact;

  // Nested routes: /products/:id → Products
  const ranked = Object.values(routes)
    .filter((route) => pathname === route.path || pathname.startsWith(`${route.path}/`))
    .sort((a, b) => b.path.length - a.path.length);
  return ranked[0] ?? null;
}

export function firstAllowedPath(
  role: string,
  permissions: string[] | null | undefined,
  hasTenant: boolean,
): string {
  const normalizedRole = (role ?? "").trim().toLowerCase();
  const perms = Array.isArray(permissions) ? permissions : [];

  // Platform operators always land on company provisioning — never profile/home.
  if (isPlatformRole(normalizedRole)) {
    return routes["platform-tenants"].path;
  }
  if (hasTenant || normalizedRole === "tenant_admin") {
    return routes.home.path;
  }
  for (const id of navItems) {
    const route = routes[id];
    if (route.platformOnly) continue;
    if (route.tenantOnly && !hasTenant) continue;
    if (!route.permission) continue;
    if (normalizedRole === "tenant_admin" || perms.includes(route.permission)) {
      return route.path;
    }
  }
  return routes.profile.path;
}
