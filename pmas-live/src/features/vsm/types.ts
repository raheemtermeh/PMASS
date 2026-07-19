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
}

export interface Pipeline {
  id: string;
  product_id: string;
  company_id: string;
  name: string;
  description: string;
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
}

export interface Project {
  id: string;
  company_id: string;
  product_id: string;
  name: string;
  description: string;
  status: string;
}

export interface Feature {
  id: string;
  company_id: string;
  product_id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string;
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
}

export function employeeLabel(e: Employee): string {
  return `${e.first_name} ${e.last_name}`.trim() || e.email;
}
