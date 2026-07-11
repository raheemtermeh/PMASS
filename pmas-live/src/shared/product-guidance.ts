import type { Permission } from "@/shared/permissions";
import type { ViewId } from "@/shared/routes";

export type ProductCapability = {
  id: string;
  section: ViewId | "workboard" | "general" | "value-stream";
  permission: Permission | null;
  title: string;
  summary: string;
  actions: string[];
  href?: string;
};

export const PRODUCT_CAPABILITIES: ProductCapability[] = [
  {
    id: "organization",
    section: "organization",
    permission: "employee.manage",
    title: "Define company structure",
    summary:
      "Tenant = Company. Create Employees, Departments (with managers), and Teams (with leads) before owning Products.",
    actions: [
      "Open Organization",
      "Add employees",
      "Create departments with managers",
      "Create teams with leads",
    ],
    href: "/organization",
  },
  {
    id: "products",
    section: "products",
    permission: "product.view",
    title: "Create & manage Products",
    summary:
      "Product is the aggregate root. Each Product has one dedicated Pipeline and an immutable execution model.",
    actions: [
      "Create a Product with an employee owner",
      "Choose execution model (locked after create)",
      "Open the Product to assign Pipeline and run stages",
    ],
    href: "/products",
  },
  {
    id: "pipeline-execution",
    section: "value-stream",
    permission: "product.update",
    title: "Pipeline & stage execution",
    summary:
      "Stages are definitions; Stage Instances hold runtime. Only one Active instance. Reject requires a reason.",
    actions: [
      "Assign Pipeline with ordered stages",
      "Start execution",
      "Move / complete / reject stages",
      "Watch department responsibility transfer",
    ],
    href: "/products",
  },
  {
    id: "planning",
    section: "value-stream",
    permission: "project.create",
    title: "Project → Feature → Task",
    summary: "Break Product work into Projects, Features, and Tasks under the chosen execution model.",
    actions: [
      "Create projects on a Product",
      "Add features under a project",
      "Create and complete tasks (assignee optional)",
    ],
    href: "/products",
  },
  {
    id: "platform-tenants",
    section: "general",
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
    summary: "User accounts are separate from Employees. Grant product.* and section permissions as needed.",
    actions: [
      "Open User Management",
      "Create user with strong password (12+ chars, symbol required)",
      "Assign product and department permissions",
    ],
    href: "/admin/users",
  },
  {
    id: "executive",
    section: "executive",
    permission: "executive",
    title: "Executive operations (legacy ops)",
    summary: "Operational tickets and blocker resolution for the ops shell.",
    actions: ["Create operational items", "Resolve blockers"],
    href: "/executive",
  },
  {
    id: "engineering",
    section: "engineering",
    permission: "engineering",
    title: "Engineering ops shell",
    summary: "Subsystem health and CI trigger (separate from Product pipeline stages).",
    actions: ["Manage subsystems", "Trigger pipeline checks"],
    href: "/engineering",
  },
];

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
    if (!hasTenant && !isPlatform) return false;
    if (isPlatform && !hasTenant) return cap.permission === null;
    if (!cap.permission) return true;
    if (isTenantAdmin || isPlatform) return true;
    return permissions.includes(cap.permission);
  });
}

export type WizardStep = {
  id: string;
  title: string;
  body: string;
  bullets?: string[];
  cta?: string;
  ctaLabel?: string;
  href?: string;
};

export function buildWizardSteps(input: {
  role: string;
  permissions: string[];
  hasTenant: boolean;
  fullName: string;
}): WizardStep[] {
  const first = input.fullName.split(" ")[0] || "there";
  const caps = capabilitiesForUser(input);
  const steps: WizardStep[] = [
    {
      id: "welcome",
      title: `Welcome, ${first}`,
      body: "PMAS is a Value Stream platform. Everything orbits Product — organization, pipeline stages, then projects and tasks.",
      bullets: [
        "Product is the aggregate root",
        "Each Product owns a dedicated Pipeline",
        "Stages run as Stage Instances",
      ],
    },
    {
      id: "org",
      title: "Start with Organization",
      body: "Create Employees, Departments, and Teams so Products have owners and stage owners.",
      bullets: ["Employees first", "Departments need managers", "Teams need leads"],
      ctaLabel: "Open Organization",
      href: "/organization",
    },
    {
      id: "product",
      title: "Create your first Product",
      body: "Assign a dedicated Pipeline, start execution, then break work into Projects → Features → Tasks.",
      bullets: ["Create Product", "Assign Pipeline", "Start / move stages"],
      ctaLabel: "Open Products",
      href: "/products",
    },
  ];

  if (caps.some((c) => c.id === "platform-tenants")) {
    steps.splice(1, 0, {
      id: "tenants",
      title: "Provision a company",
      body: "As platform admin, create a tenant workspace and its company admin before using Products.",
      bullets: ["Create tenant slug", "Create company admin", "Share Company ID for login"],
      ctaLabel: "Open Companies",
      href: "/platform/tenants",
    });
  }

  steps.push({
    id: "hub",
    title: "Use the Value Stream Hub",
    body: "Your playbook lists capabilities filtered by role. Check them off as you go.",
    bullets: ["Open the hub anytime", "Replay the tour from Help"],
    ctaLabel: "Open Hub",
    href: "/product-manager",
  });

  return steps;
}

