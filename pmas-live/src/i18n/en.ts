import { notFound } from 'next/navigation';

type Locale = 'en' | 'fa';

type NavLabels = {
  [key: string]: string;
};

type RouteTitles = {
  [key: string]: string;
};

type RouteSubtitles = {
  [key: string]: string;
};

type Login = {
  title: string;
  subtitle: string;
  companyLogin: string;
  platformAdmin: string;
  companyId: string;
  email: string;
  password: string;
};

type Sidebar = {
  expand: string;
  collapse: string;
  signOut: string;
};

type Auth = {
  loading: string;
  error: string;
};

export const navLabels: NavLabels = {
  "product-manager": "Product Manager",
  profile: "Profile",
  executive: "Executive Control",
  uiux: "UI/UX Design",
  engineering: "Engineering",
  infrastructure: "Infrastructure",
  marketing: "Marketing",
  "graph-view": "Graph Network",
  finance: "Finance Ledger",
  legalhr: "Legal & HR",
  settings: "System Settings",
  "admin-users": "User Management",
  "platform-tenants": "Companies",
};

export const routeTitles: RouteTitles = {
  executive: "Executive Control Room",
  uiux: "UI/UX Workspace",
  engineering: "Engineering Core Platform",
  infrastructure: "Infrastructure Gateway",
  marketing: "Marketing Workspace",
  "graph-view": "Network Topology",
  finance: "Finance Telemetry",
  legalhr: "Legal & HR Compliance",
  settings: "System Settings",
  "admin-users": "User Management",
  "platform-tenants": "Company Provisioning",
  "product-manager": "Product Manager",
  profile: "Profile",
};

export const routeSubtitles: RouteSubtitles = {
  executive: "Global Project Portfolio Telemetry",
  uiux: "Design tokens and asset management",
  engineering: "Subsystems and CI/CD pipeline",
  infrastructure: "Cluster and deployment telemetry",
  marketing: "Campaign metrics and funnel telemetry",
  "graph-view": "Cross-functional dependency graph",
  finance: "Burn rate and expenditure tracking",
  legalhr: "Compliance controls and workforce",
  settings: "Integration credentials vault",
  "admin-users": "Create employees and assign workspace permissions",
  "platform-tenants": "Create isolated company workspaces for customers",
  "product-manager": "Playbooks and capability map filtered by your access",
  profile: "Your identity, contact details, and account security",
};

export const login: Login = {
  title: "PMAS Live",
  subtitle: "Sign in to your company workspace",
  companyLogin: "Company login",
  platformAdmin: "Platform admin",
  companyId: "Company ID",
  email: "Email",
  password: "Password",
};

export const sidebar: Sidebar = {
  expand: "Expand Sidebar",
  collapse: "Collapse Sidebar",
  signOut: "Sign out",
};

export const auth: Auth = {
  loading: "Loading PMAS Live…",
  error: "Cannot reach API server. Start the backend on port 8080.",
};
