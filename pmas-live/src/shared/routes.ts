import type { Permission } from "./permissions";

export type ViewId =
  | "home"
  | "organization"
  | "products"
  | "planning"
  | "profile"
  | "admin-users"
  | "platform-tenants"
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
    title: "Value Stream Home",
    subtitle: "Product lifecycle overview for your company",
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
    title: "Company Provisioning",
    subtitle: "Create isolated company workspaces for customers",
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

/** Primary navigation — Product-centric VSM. */
export const navItems: ViewId[] = [
  "home",
  "organization",
  "products",
  "planning",
  "profile",
  "admin-users",
  "settings",
  "platform-tenants",
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
  permissions: string[],
  hasTenant: boolean,
): string {
  if (role === "platform_admin" || role === "super_admin") {
    return routes["platform-tenants"].path;
  }
  if (hasTenant || role === "tenant_admin") {
    return routes.home.path;
  }
  for (const id of navItems) {
    const route = routes[id];
    if (route.platformOnly) continue;
    if (route.tenantOnly && !hasTenant) continue;
    if (!route.permission) continue;
    if (role === "tenant_admin" || permissions.includes(route.permission)) {
      return route.path;
    }
  }
  return routes.profile.path;
}
