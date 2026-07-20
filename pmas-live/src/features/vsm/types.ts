export interface Employee {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
}

export interface Department {
  id: string;
  company_id: string;
  manager_id?: string | null;
  name: string;
  status: string;
}

export interface Team {
  id: string;
  company_id: string;
  department_id: string;
  lead_id?: string | null;
  name: string;
  description: string;
  status: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  logo_url?: string;
  language?: string;
  timezone?: string;
}

export interface Product {
  id: string;
  company_id: string;
  owner_id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  execution_model: string;
  pipeline_id?: string | null;

  // MVP additions — optional/additive.
  code?: string;
  product_type?: string;
  manager_id?: string | null;
  priority?: string;
  vision?: string;
  goal?: string;
  success_metrics?: string;
  business_value?: string;
  visibility?: string;
  deleted_at?: string | null;
}

export interface ProductMember {
  id: string;
  company_id: string;
  product_id: string;
  employee_id: string;
  role: string;
  created_at: string;
}

export interface Pipeline {
  id: string;
  product_id: string;
  company_id: string;
  name: string;
  description: string;

  // MVP additions.
  status?: string;
  archived_at?: string | null;
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

  // MVP additions.
  color?: string;
}

export interface StageInstance {
  id: string;
  product_id: string;
  stage_id: string;
  department_id?: string | null;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  reject_reason?: string;

  // MVP additions.
  duration_seconds?: number | null;
}

export interface Project {
  id: string;
  company_id: string;
  product_id: string;
  name: string;
  description: string;
  status: string;

  // MVP additions — optional/additive.
  code?: string;
  goal?: string;
  priority?: string;
  owner_id?: string | null;
  manager_id?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
  estimated_duration_days?: number | null;
  deleted_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  archived_by?: string | null;
}

export interface ProjectMember {
  id: string;
  company_id: string;
  project_id: string;
  employee_id: string;
  role: string;
  created_at: string;
}

export interface Feature {
  id: string;
  company_id: string;
  product_id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string;

  // MVP additions — optional/additive.
  code?: string;
  description?: string;
  goal?: string;
  feature_type?: string;
  owner_id?: string | null;
  team_id?: string | null;
  parent_feature_id?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
  estimated_effort?: number | null;
  progress_pct?: number;
  deleted_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  archived_by?: string | null;
}

export interface FeatureMember {
  id: string;
  company_id: string;
  feature_id: string;
  employee_id: string;
  role: string;
  created_at: string;
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

  // MVP additions — optional/additive.
  depends_on_ids?: string[];
  progress_pct?: number;
  description?: string;
  task_type?: string;
  start_date?: string | null;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  deleted_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  archived_by?: string | null;
}

export interface ChecklistItem {
  id: string;
  company_id: string;
  task_id: string;
  title: string;
  position: number;
  is_done: boolean;
  created_at: string;
  updated_at: string;
}

export function employeeLabel(e: Employee): string {
  return `${e.first_name} ${e.last_name}`.trim() || e.email;
}
