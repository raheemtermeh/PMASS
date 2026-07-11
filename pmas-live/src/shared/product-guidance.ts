import type { Permission } from "@/shared/permissions";
import { isPlatformRole } from "@/shared/permissions";
import type { ViewId } from "@/shared/routes";

export type ProductCapability = {
  id: string;
  section: ViewId | "platform" | "general";
  permission: Permission | null;
  title: string;
  summary: string;
  actions: string[];
  href?: string;
};

export type WizardStep = {
  title: string;
  body: string;
  bullets: string[];
  href?: string;
  ctaLabel?: string;
};

export const PRODUCT_CAPABILITIES: ProductCapability[] = [
  {
    id: "organization",
    section: "organization",
    permission: "employee.manage",
    title: "Define organization structure",
    summary: "Company → Department → Team → Employee. Who owns work before Products move.",
    actions: [
      "Create Employees",
      "Create Departments with a Manager",
      "Create Teams with a Lead",
    ],
    href: "/organization",
  },
  {
    id: "products",
    section: "products",
    permission: "product.view",
    title: "Manage Products (aggregate root)",
    summary: "Create Products with Owner + locked Execution Model. Attach a dedicated Pipeline.",
    actions: [
      "Create Product",
      "Open Product detail",
      "Create Pipeline + Stages",
      "Start / Move / Reject stages",
    ],
    href: "/products",
  },
  {
    id: "planning",
    section: "planning",
    permission: "project.create",
    title: "Plan execution work",
    summary: "Product → Project → Feature → Task cascade for delivery work.",
    actions: ["Create Project under Product", "Add Features", "Add and complete Tasks"],
    href: "/planning",
  },
  {
    id: "users",
    section: "admin-users",
    permission: "users",
    title: "Invite users & VSM permissions",
    summary: "Grant product.*, project.*, department.manage, and related permissions.",
    actions: ["Open User Management", "Create user", "Assign VSM permissions"],
    href: "/admin/users",
  },
  {
    id: "platform-tenants",
    section: "platform",
    permission: null,
    title: "Provision companies",
    summary: "Platform admins create Tenant = Company workspaces.",
    actions: ["Open Companies", "Provision slug + admin"],
    href: "/platform/tenants",
  },
];

export function capabilitiesForUser(input: {
  role: string;
  permissions: string[];
  hasTenant: boolean;
}): ProductCapability[] {
  const platform = isPlatformRole(input.role);
  return PRODUCT_CAPABILITIES.filter((cap) => {
    if (cap.section === "platform") return platform;
    if (!input.hasTenant && !platform) return false;
    if (!cap.permission) return true;
    if (platform || input.role === "tenant_admin") return true;
    return input.permissions.includes(cap.permission);
  });
}

export function buildWizardSteps(input: {
  role: string;
  permissions: string[];
  hasTenant: boolean;
  fullName: string;
}): WizardStep[] {
  const first = input.fullName.split(" ")[0] || "there";
  const steps: WizardStep[] = [
    {
      title: `Welcome, ${first}`,
      body: "PMAS is a Value Stream platform. Everything orbits Product — not tickets or departments.",
      bullets: [
        "Organization defines who is responsible",
        "Each Product has a dedicated Pipeline",
        "Planning breaks work into Project → Feature → Task",
      ],
    },
  ];

  if (isPlatformRole(input.role)) {
    steps.push({
      title: "Provision a company",
      body: "As platform admin, create a Tenant (= Company) workspace first.",
      bullets: ["Open Companies", "Set slug + company admin", "Customers log in with that Company ID"],
      href: "/platform/tenants",
      ctaLabel: "Open Companies",
    });
    return steps;
  }

  if (input.hasTenant) {
    steps.push(
      {
        title: "Build organization",
        body: "Create employees before products — owners and managers are employees.",
        bullets: ["Add Employees", "Add Departments with managers", "Add Teams with leads"],
        href: "/organization",
        ctaLabel: "Open Organization",
      },
      {
        title: "Create your first Product",
        body: "Product is the aggregate root. Execution model cannot change after create.",
        bullets: ["New Product + Owner", "Attach Pipeline + Stages", "Start execution"],
        href: "/products",
        ctaLabel: "Open Products",
      },
      {
        title: "Plan the work",
        body: "Under the Product, create Projects, Features, and Tasks.",
        bullets: ["Select Product", "Create Project", "Add Features and Tasks"],
        href: "/planning",
        ctaLabel: "Open Planning",
      },
    );
  }

  return steps;
}
