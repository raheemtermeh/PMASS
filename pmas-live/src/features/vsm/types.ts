export type EntityStatus = string;

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  user_id?: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  manager_id?: string | null;
  name: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  company_id: string;
  department_id: string;
  lead_id?: string | null;
  name: string;
  description: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ProductStatus = "DRAFT" | "READY" | "ACTIVE" | "COMPLETED" | "ARCHIVED" | string;
export type ExecutionModel =
  | "DIRECT_TASK"
  | "PROJECT_FEATURE_TASK"
  | "FEATURE_TASK"
  | string;

export interface Product {
  id: string;
  company_id: string;
  owner_id: string;
  name: string;
  description: string;
  category: string;
  status: ProductStatus;
  execution_model: ExecutionModel;
  pipeline_id?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string;
  company_id: string;
  product_id: string;
  name: string;
  description: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  description: string;
  order: number;
  entry_criteria: string;
  exit_criteria: string;
  department_id?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface StageInstance {
  id: string;
  company_id: string;
  product_id: string;
  stage_id: string;
  department_id?: string | null;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  reject_reason?: string;
  duration_seconds?: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  product_id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Feature {
  id: string;
  company_id: string;
  product_id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  company_id: string;
  feature_id: string;
  assignee_id?: string | null;
  title: string;
  status: string;
  priority: string;
  due_date?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export function employeeLabel(e: Pick<Employee, "first_name" | "last_name" | "email">): string {
  const name = `${e.first_name} ${e.last_name}`.trim();
  return name || e.email;
}

export const EXECUTION_MODELS = [
  { value: "PROJECT_FEATURE_TASK", label: "Project → Feature → Task" },
  { value: "FEATURE_TASK", label: "Feature → Task" },
  { value: "DIRECT_TASK", label: "Direct Task" },
] as const;

export const PRODUCT_STATUSES = ["DRAFT", "READY", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
