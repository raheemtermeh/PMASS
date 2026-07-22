export interface DashboardSummary {
  active_products: number;
  completed_products: number;
  draft_ready_products: number;
  open_tasks: number;
  unread_notifications: number;
  employees: number;
  departments: number;
  projects: number;

  // MVP additions — optional/additive.
  on_hold_products?: number;
  overdue_tasks?: number;
  completed_tasks?: number;
  active_projects?: number;
  features?: number;
  open_features?: number;
  completed_features?: number;
  active_workflows?: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface DayCount {
  day: string;
  count: number;
}

export interface DashboardCharts {
  products_by_status: NamedCount[];
  tasks_by_status: NamedCount[];
  tasks_by_priority: NamedCount[];
  activity_by_day: DayCount[];
  stages_by_status: NamedCount[];
}

export interface FlowStage {
  id: string;
  name: string;
  order: number;
  status: string;
}

export interface FlowProject {
  id: string;
  name: string;
  status: string;
}

export interface FlowFeature {
  id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string;
}

export interface FlowProduct {
  id: string;
  name: string;
  status: string;
  pipeline_id?: string | null;
  pipeline_name?: string;
  pipeline_status?: string;
  active_stage?: string;
  next_stage?: string;
  stages: FlowStage[];
  projects: FlowProject[];
  features?: FlowFeature[];
}

export interface FlowGraph {
  company_name: string;
  products: FlowProduct[];
}

export interface NamedWorkspaceItem {
  id: string;
  name: string;
  status: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  charts: DashboardCharts;
  flow: FlowGraph;
  my_tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date?: string | null;
  }[];
  // MVP additions — optional/additive.
  my_products?: NamedWorkspaceItem[];
  my_projects?: NamedWorkspaceItem[];
  my_features?: NamedWorkspaceItem[];
  pipeline_statuses: {
    product_id: string;
    product_name: string;
    status: string;
    active_stage?: string;
  }[];
  department_products: {
    department_id: string;
    department_name: string;
    product_count: number;
  }[];
  recent_activities: {
    id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    created_at: string;
  }[];
  notifications: {
    id: string;
    type: string;
    title: string;
    body: string;
    is_read: boolean;
    created_at: string;
  }[];
}

export const CHART_PALETTE = [
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#3b82f6",
  "#14b8a6",
  "#ec4899",
];
