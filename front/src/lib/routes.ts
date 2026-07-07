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
  | "profile";

export interface RouteConfig {
  id: ViewId;
  path: string;
  title: string;
  subtitle: string;
}

export const routes: Record<ViewId, RouteConfig> = {
  executive: {
    id: "executive",
    path: "/executive",
    title: "Executive Control Room",
    subtitle: "Global Project Portfolio Telemetry",
  },
  uiux: {
    id: "uiux",
    path: "/uiux",
    title: "UI/UX Workspace & Design System",
    subtitle: "High-Fidelity UI Layouts & Figma Integrations",
  },
  engineering: {
    id: "engineering",
    path: "/engineering",
    title: "Engineering Core Platform",
    subtitle: "CI/CD Telemetry, Pull Request Matrix & Tech Stack Health",
  },
  infrastructure: {
    id: "infrastructure",
    path: "/infrastructure",
    title: "Infrastructure Cluster Gateway",
    subtitle:
      "Server Node Allocations, Container Health & Migration Sequencing",
  },
  marketing: {
    id: "marketing",
    path: "/marketing",
    title: "Marketing Acquisition Workspace",
    subtitle: "Acquisition Channels & Conversion Funnel Telemetry",
  },
  "graph-view": {
    id: "graph-view",
    path: "/graph-view",
    title: "Global Network Topology & Resource Analytics",
    subtitle:
      "Multi-layered cross-functional graph mapping task lineage, human capital density, and structural bottlenecks.",
  },
  finance: {
    id: "finance",
    path: "/finance",
    title: "Finance & Burn Telemetry",
    subtitle: "Operational vs Capital Expenditures & Forecasting",
  },
  legalhr: {
    id: "legalhr",
    path: "/legalhr",
    title: "Legal & HR Compliance Matrix",
    subtitle: "Compliance Controls (GDPR/SOC2) & Workforce Onboarding",
  },
  profile: {
    id: "profile",
    path: "/profile",
    title: "Sarah Jenkins - Profile Settings",
    subtitle: "Manage your profile fields and avatar color",
  },
  settings: {
    id: "settings",
    path: "/settings",
    title: "System Settings Control",
    subtitle:
      "Tweak layout density, simulation ticks, blocker alerts and threshold rules",
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
];

export function getRouteByPath(pathname: string): RouteConfig {
  const match = Object.values(routes).find((route) => route.path === pathname);
  return match ?? routes.executive;
}

export function getViewIdFromPath(pathname: string): ViewId {
  return getRouteByPath(pathname).id;
}
