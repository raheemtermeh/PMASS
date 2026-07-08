import type { Permission } from "@/shared/permissions";
import type { ViewId } from "@/shared/routes";
import { routes } from "@/shared/routes";

export type ProductCapability = {
  id: string;
  section: ViewId | "platform" | "workboard" | "general";
  permission: Permission | null;
  title: string;
  summary: string;
  actions: string[];
  href?: string;
};

export const PRODUCT_CAPABILITIES: ProductCapability[] = [
  {
    id: "platform-tenants",
    section: "platform",
    permission: null,
    title: "Provision companies",
    summary: "Create an isolated tenant workspace and its first company admin.",
    actions: [
      "Open Companies",
      "Enter tenant slug + admin credentials",
      "Share Company ID with the customer for login",
    ],
    href: "/platform/tenants",
  },
  {
    id: "users",
    section: "admin-users",
    permission: "users",
    title: "Invite teammates & assign permissions",
    summary: "Create employees and grant only the department access they need.",
    actions: [
      "Open User Management",
      "Create user with strong password",
      "Assign section permissions (marketing, engineering, …)",
    ],
    href: "/admin/users",
  },
  {
    id: "workboard",
    section: "workboard",
    permission: null,
    title: "Section workboard (task / todo / status)",
    summary:
      "Every department page includes a workboard for employer-defined work items with status tracking.",
    actions: [
      "Add a Task, Todo, or Status update",
      "Set priority and assignee",
      "Use Mark done when complete",
    ],
  },
  {
    id: "executive",
    section: "executive",
    permission: "executive",
    title: "Executive operations",
    summary: "Track blockers, tasks, issues, and handoff tickets across the portfolio.",
    actions: [
      "Create operational items (blocker/task/issue)",
      "Resolve blockers when cleared",
      "Monitor severity and owners",
    ],
    href: "/executive",
  },
  {
    id: "marketing",
    section: "marketing",
    permission: "marketing",
    title: "Marketing campaigns",
    summary: "Manage acquisition campaigns: leads, conversion, spend, and lifecycle status.",
    actions: ["Create campaign", "Update metrics & status", "Link dependent subsystem if needed"],
    href: "/marketing",
  },
  {
    id: "engineering",
    section: "engineering",
    permission: "engineering",
    title: "Engineering subsystems",
    summary: "Register product modules, health, load, and trigger CI pipelines.",
    actions: ["Create subsystem (name + slug)", "Set health status", "Trigger CI when ready"],
    href: "/engineering",
  },
  {
    id: "uiux",
    section: "uiux",
    permission: "uiux",
    title: "UI/UX design system",
    summary: "Maintain design token JSON sets and CDN asset sync status.",
    actions: ["Add token category as JSON", "Register UI assets with size", "Push assets to CDN"],
    href: "/uiux",
  },
  {
    id: "infrastructure",
    section: "infrastructure",
    permission: "infrastructure",
    title: "Infrastructure nodes",
    summary: "Track servers/clusters with CPU/RAM health and region notes.",
    actions: ["Register node", "Update CPU/RAM & status", "Document region/notes"],
    href: "/infrastructure",
  },
  {
    id: "graph-view",
    section: "graph-view",
    permission: "graph-view",
    title: "Graph network",
    summary: "Map team capacity and subsystem dependency edges.",
    actions: ["Add team members", "Connect dependency edges", "Keep capacity weights current"],
    href: "/graph-view",
  },
  {
    id: "finance",
    section: "finance",
    permission: "finance",
    title: "Finance ledger",
    summary: "Log OpEx / CapEx / revenue entries with period and status.",
    actions: ["Add ledger entry", "Filter by Active/Closed/Forecast", "Keep notes for audit"],
    href: "/finance",
  },
  {
    id: "legalhr",
    section: "legalhr",
    permission: "legalhr",
    title: "Legal & HR compliance",
    summary: "Maintain SOC2/GDPR-style controls with owners and status.",
    actions: ["Add control code + title", "Assign owner", "Update compliance status"],
    href: "/legalhr",
  },
  {
    id: "settings",
    section: "settings",
    permission: "settings",
    title: "Credentials vault",
    summary: "Store integration secrets encrypted at rest (values stay masked in UI).",
    actions: ["Add named secret", "Describe purpose", "Rotate values when needed"],
    href: "/settings",
  },
];

export type WizardStep = {
  id: string;
  title: string;
  body: string;
  bullets: string[];
  ctaLabel?: string;
  href?: string;
};

export function buildWizardSteps(input: {
  role: string;
  permissions: string[];
  hasTenant: boolean;
  fullName: string;
}): WizardStep[] {
  const { role, permissions, hasTenant, fullName } = input;
  const isPlatform = role === "platform_admin" || role === "super_admin";
  const isTenantAdmin = role === "tenant_admin";
  const firstName = fullName.split(" ")[0] || "there";

  if (isPlatform) {
    return [
      {
        id: "welcome",
        title: `Welcome, ${firstName}`,
        body: "You are on the PMAS platform console. Your job is to provision isolated company workspaces—not day-to-day department work.",
        bullets: [
          "Each company gets its own tenant_id data boundary",
          "Customers log in with Company ID (slug) + email/password",
          "Platform admins should not use tenant department panels",
        ],
      },
      {
        id: "provision",
        title: "Provision your first company",
        body: "Create a tenant slug, display name, and the first company admin account.",
        bullets: [
          "Slug must be lowercase (e.g. acme-corp)",
          "Admin password must meet strength rules",
          "Give the customer: Company ID, email, temporary password",
        ],
        ctaLabel: "Open Companies",
        href: "/platform/tenants",
      },
      {
        id: "handoff",
        title: "Hand off & verify",
        body: "Sign out of the platform account, then verify company login works with the new credentials.",
        bullets: [
          "Use mode: Company login",
          "Company ID = tenant slug",
          "Inside the company, use Product Manager to finish setup",
        ],
      },
    ];
  }

  const allowed = PRODUCT_CAPABILITIES.filter((cap) => {
    if (cap.id === "platform-tenants") return false;
    if (cap.id === "workboard") return hasTenant;
    if (!cap.permission) return true;
    return isTenantAdmin || permissions.includes(cap.permission);
  });

  const deptCaps = allowed.filter(
    (c) => c.permission && c.permission !== "users" && c.permission !== "settings",
  );

  const steps: WizardStep[] = [
    {
      id: "welcome",
      title: `Welcome to PMAS Live, ${firstName}`,
      body: isTenantAdmin
        ? "You are the company admin. You can manage users and every department your company purchased access for."
        : "Your account only shows the departments you were granted. Each panel has real create / edit / delete workflows—not mock data.",
      bullets: [
        hasTenant ? "Data is isolated to your company workspace" : "No tenant context yet",
        "Top of each section: workboard for tasks / todos / status",
        "Below: domain resources for that department",
      ],
    },
  ];

  if (isTenantAdmin) {
    steps.push({
      id: "team",
      title: "Invite your team",
      body: "Create users and grant the minimum permissions per role. Tenant admins inherit all sections.",
      bullets: [
        "Open User Management",
        "Assign only needed permissions",
        "Use strong passwords (upper/lower/digit + symbol or 14+ chars)",
      ],
      ctaLabel: "Manage users",
      href: "/admin/users",
    });
  }

  steps.push({
    id: "sections",
    title: "Your accessible workspaces",
    body:
      deptCaps.length > 0
        ? "These are the product areas enabled for you. Open one to create records and track work."
        : "No department modules are assigned yet. Ask your company admin to grant permissions.",
    bullets:
      deptCaps.length > 0
        ? deptCaps.map((c) => `${c.title}: ${c.summary}`)
        : ["Contact your admin if you expected access"],
    ctaLabel: deptCaps[0]?.href ? `Go to ${deptCaps[0].title}` : undefined,
    href: deptCaps[0]?.href,
  });

  steps.push({
    id: "workboard",
    title: "How work gets done",
    body: "Every section supports employer-defined work items plus domain CRUD.",
    bullets: [
      "Workboard kinds: Task, Todo, Status update",
      "Statuses: Backlog → Todo → In Progress → Done",
      "Domain tables: Add / Edit / Delete with confirmation",
    ],
  });

  if (isTenantAdmin || permissions.includes("settings")) {
    steps.push({
      id: "settings",
      title: "Wire integrations",
      body: "Store API keys and secrets in Settings. Values are encrypted at rest and masked in the UI.",
      bullets: ["Name each credential clearly", "Never reuse production secrets in demos", "Rotate when staff leave"],
      ctaLabel: "Open Settings",
      href: "/settings",
    });
  }

  steps.push({
    id: "pm",
    title: "Product Manager is your map",
    body: "Anytime you need a checklist of what you can do, open Product Manager. It filters by your live permissions.",
    bullets: [
      "See progress across playbooks",
      "Jump to the right panel",
      "Re-run this tour from Help anytime",
    ],
    ctaLabel: "Open Product Manager",
    href: "/product-manager",
  });

  return steps;
}

export function capabilitiesForUser(input: {
  role: string;
  permissions: string[];
  hasTenant: boolean;
}): ProductCapability[] {
  const { role, permissions, hasTenant } = input;
  const isPlatform = role === "platform_admin" || role === "super_admin";
  const isTenantAdmin = role === "tenant_admin";

  return PRODUCT_CAPABILITIES.filter((cap) => {
    if (cap.id === "platform-tenants") return isPlatform;
    if (isPlatform) return false;
    if (!hasTenant) return false;
    if (cap.id === "workboard") return true;
    if (!cap.permission) return true;
    return isTenantAdmin || permissions.includes(cap.permission);
  });
}

export function sectionLabel(viewId: ViewId): string {
  return routes[viewId]?.title ?? viewId;
}
