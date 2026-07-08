export interface PipelineRca {
  blocker_ticket: string;
  summary: string;
  root_cause: string;
  remediation: string;
  ai_confidence: number;
}

export interface PipelineTriggerResponse {
  status: string;
  message: string;
  rca?: PipelineRca;
}

export interface PipelineRepository {
  trigger(subsystemId: number): Promise<{
    ok: boolean;
    status: number;
    data: PipelineTriggerResponse;
  }>;
}
