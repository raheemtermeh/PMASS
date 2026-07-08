import type { Permission } from "./permissions";

export type ViewId =
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
}

export const routes: Record<ViewId, RouteConfig> = {
  executive: {
    id: "executive",
    path: "/executive",
    title: "Executive Control Room",
    subtitle: "Global Project Portfolio Telemetry",
    permission: "executive",
    tenantOnly: true,
  },
  uiux: {
    id: "uiux",
    path: "/uiux",
    title: "UI/UX Workspace",
    subtitle: "Design tokens and asset management",
    permission: "uiux",
    tenantOnly: true,
  },
  engineering: {
    id: "engineering",
    path: "/engineering",
    title: "Engineering Core Platform",
    subtitle: "Subsystems and CI/CD pipeline",
    permission: "engineering",
    tenantOnly: true,
  },
  infrastructure: {
    id: "infrastructure",
    path: "/infrastructure",
    title: "Infrastructure Gateway",
    subtitle: "Cluster and deployment telemetry",
    permission: "infrastructure",
    tenantOnly: true,
  },
  marketing: {
    id: "marketing",
    path: "/marketing",
    title: "Marketing Workspace",
    subtitle: "Campaign metrics and funnel telemetry",
    permission: "marketing",
    tenantOnly: true,
  },
  "graph-view": {
    id: "graph-view",
    path: "/graph-view",
    title: "Network Topology",
    subtitle: "Cross-functional dependency graph",
    permission: "graph-view",
    tenantOnly: true,
  },
  finance: {
    id: "finance",
    path: "/finance",
    title: "Finance Telemetry",
    subtitle: "Burn rate and expenditure tracking",
    permission: "finance",
    tenantOnly: true,
  },
  legalhr: {
    id: "legalhr",
    path: "/legalhr",
    title: "Legal & HR Compliance",
    subtitle: "Compliance controls and workforce",
    permission: "legalhr",
    tenantOnly: true,
  },
  settings: {
    id: "settings",
    path: "/settings",
    title: "System Settings",
    subtitle: "Integration credentials vault",
    permission: "settings",
    tenantOnly: true,
  },
  "admin-users": {
    id: "admin-users",
    path: "/admin/users",
    title: "User Management",
    subtitle: "Create employees and assign workspace permissions",
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
};

export const navItems: ViewId[] = [
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
  return Object.values(routes).find((route) => route.path === pathname) ?? null;
}

export function firstAllowedPath(
  role: string,
  permissions: string[],
  hasTenant: boolean,
): string {
  if (role === "platform_admin" || role === "super_admin") {
    return routes["platform-tenants"].path;
  }
  for (const id of navItems) {
    const route = routes[id];
    if (route.platformOnly) continue;
    if (route.tenantOnly && !hasTenant) continue;
    if (!route.permission) continue;
    if (
      role === "tenant_admin" ||
      permissions.includes(route.permission)
    ) {
      return route.path;
    }
  }
  return "/login";
}
