import type { Permission } from "./permissions";

export type ViewId =
  | "products"
  | "organization"
  | "product-manager"
  | "profile"
  | "executive"
  | "uiux"
  | "engineering"
  | "infrastructure"
  | "marketing"
  | "graph-view"
  | "finance"
  | "legalhr"
  | "settings"
  | "admin-users"
  | "platform-tenants";

export interface RouteConfig {
  id: ViewId;
  path: string;
  title: string;
  subtitle: string;
  permission: Permission | null;
  platformOnly?: boolean;
  tenantOnly?: boolean;
  group?: "value-stream" | "operations" | "admin";
}

export const routes: Record<ViewId, RouteConfig> = {
  products: {
    id: "products",
    path: "/products",
    title: "Products",
    subtitle: "Value stream aggregate — pipeline, stages, and delivery",
    permission: "product.view",
    tenantOnly: true,
    group: "value-stream",
  },
  organization: {
    id: "organization",
    path: "/organization",
    title: "Organization",
    subtitle: "Company structure: employees, departments, and teams",
    permission: "employee.manage",
    tenantOnly: true,
    group: "value-stream",
  },
  "product-manager": {
    id: "product-manager",
    path: "/product-manager",
    title: "Value Stream Hub",
    subtitle: "Product-centric playbook for this company workspace",
    permission: null,
    group: "value-stream",
  },
  profile: {
    id: "profile",
    path: "/profile",
    title: "Profile",
    subtitle: "Your identity, contact details, and account security",
    permission: null,
    group: "value-stream",
  },
  executive: {
    id: "executive",
    path: "/executive",
    title: "Executive Control Room",
    subtitle: "Operational tickets and blocker resolution",
    permission: "executive",
    tenantOnly: true,
    group: "operations",
  },
  uiux: {
    id: "uiux",
    path: "/uiux",
    title: "UI/UX Workspace",
    subtitle: "Design tokens and asset management",
    permission: "uiux",
    tenantOnly: true,
    group: "operations",
  },
  engineering: {
    id: "engineering",
    path: "/engineering",
    title: "Engineering Core Platform",
    subtitle: "Subsystems and CI/CD pipeline",
    permission: "engineering",
    tenantOnly: true,
    group: "operations",
  },
  infrastructure: {
    id: "infrastructure",
    path: "/infrastructure",
    title: "Infrastructure Gateway",
    subtitle: "Cluster and deployment telemetry",
    permission: "infrastructure",
    tenantOnly: true,
    group: "operations",
  },
  marketing: {
    id: "marketing",
    path: "/marketing",
    title: "Marketing Workspace",
    subtitle: "Campaign metrics and funnel telemetry",
    permission: "marketing",
    tenantOnly: true,
    group: "operations",
  },
  "graph-view": {
    id: "graph-view",
    path: "/graph-view",
    title: "Network Topology",
    subtitle: "Cross-functional dependency graph",
    permission: "graph-view",
    tenantOnly: true,
    group: "operations",
  },
  finance: {
    id: "finance",
    path: "/finance",
    title: "Finance Telemetry",
    subtitle: "Burn rate and expenditure tracking",
    permission: "finance",
    tenantOnly: true,
    group: "operations",
  },
  legalhr: {
    id: "legalhr",
    path: "/legalhr",
    title: "Legal & HR Compliance",
    subtitle: "Compliance controls and workforce",
    permission: "legalhr",
    tenantOnly: true,
    group: "operations",
  },
  settings: {
    id: "settings",
    path: "/settings",
    title: "System Settings",
    subtitle: "Integration credentials vault",
    permission: "settings",
    tenantOnly: true,
    group: "admin",
  },
  "admin-users": {
    id: "admin-users",
    path: "/admin/users",
    title: "User Management",
    subtitle: "Create accounts and assign workspace permissions",
    permission: "users",
    tenantOnly: true,
    group: "admin",
  },
  "platform-tenants": {
    id: "platform-tenants",
    path: "/platform/tenants",
    title: "Company Provisioning",
    subtitle: "Create isolated company workspaces for customers",
    permission: null,
    platformOnly: true,
    group: "admin",
  },
};

/** Primary navigation order — Value Stream first. */
export const navItems: ViewId[] = [
  "product-manager",
  "products",
  "organization",
  "profile",
  "executive",
  "uiux",
  "engineering",
  "infrastructure",
  "marketing",
  "graph-view",
  "finance",
  "legalhr",
  "settings",
  "admin-users",
  "platform-tenants",
];

export function getRouteByPath(pathname: string): RouteConfig | null {
  const exact = Object.values(routes).find((route) => route.path === pathname);
  if (exact) return exact;
  // Nested product detail under /products/:id
  if (pathname.startsWith("/products/")) return routes.products;
  return null;
}

export function firstAllowedPath(
  role: string,
  permissions: string[],
  hasTenant: boolean,
): string {
  if (role === "platform_admin" || role === "super_admin") {
    return routes["product-manager"].path;
  }
  if (hasTenant || role === "tenant_admin") {
    return routes.products.path;
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
  return routes["product-manager"].path;
}
