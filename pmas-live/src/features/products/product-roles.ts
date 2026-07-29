/** Product-scoped roles (distinct from workspace Admin / Employee / Viewer). */
export const PRODUCT_MEMBER_ROLES = [
  "OWNER",
  "MANAGER",
  "CONTRIBUTOR",
  "APPROVER",
  "STAKEHOLDER",
  "VIEWER",
] as const;

export type ProductMemberRole = (typeof PRODUCT_MEMBER_ROLES)[number];

export function productRoleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
