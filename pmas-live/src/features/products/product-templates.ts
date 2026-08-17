export interface PipelineTemplate {
  id: string;
  stages: string[];
}

/** Company-scoped pipeline templates (MVP: curated presets per product type). */
export const COMPANY_PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "software",
    stages: ["Discovery", "Analysis", "Design", "Development", "QA", "Release"],
  },
  {
    id: "erp",
    stages: ["Requirements", "Configuration", "Integration", "UAT", "Go-live"],
  },
  {
    id: "crm",
    stages: ["Discovery", "Data Model", "Workflow", "Pilot", "Rollout"],
  },
  {
    id: "mobile",
    stages: ["Concept", "UX", "Build", "Beta", "Store Release"],
  },
  {
    id: "marketing",
    stages: ["Research", "Strategy", "Creative", "Launch", "Measure"],
  },
  {
    id: "research",
    stages: ["Hypothesis", "Experiment", "Analysis", "Report", "Decision"],
  },
];
