export interface PipelineTemplate {
  id: string;
  label: string;
  stages: string[];
}

/** Company-scoped pipeline templates (MVP: curated presets per product type). */
export const COMPANY_PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "software",
    label: "Software",
    stages: ["Discovery", "Analysis", "Design", "Development", "QA", "Release"],
  },
  {
    id: "erp",
    label: "ERP",
    stages: ["Requirements", "Configuration", "Integration", "UAT", "Go-live"],
  },
  {
    id: "crm",
    label: "CRM",
    stages: ["Discovery", "Data Model", "Workflow", "Pilot", "Rollout"],
  },
  {
    id: "mobile",
    label: "Mobile App",
    stages: ["Concept", "UX", "Build", "Beta", "Store Release"],
  },
  {
    id: "marketing",
    label: "Marketing",
    stages: ["Research", "Strategy", "Creative", "Launch", "Measure"],
  },
  {
    id: "research",
    label: "Research",
    stages: ["Hypothesis", "Experiment", "Analysis", "Report", "Decision"],
  },
];
