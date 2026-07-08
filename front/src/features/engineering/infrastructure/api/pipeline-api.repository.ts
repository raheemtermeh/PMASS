import { getApiBaseUrl } from "@/shared/config/env";
import type {
  PipelineRepository,
  PipelineTriggerResponse,
} from "../../domain/entities/pipeline";

export class PipelineApiRepository implements PipelineRepository {
  async trigger(subsystemId: number) {
    const response = await fetch(
      `${getApiBaseUrl()}/api/v1/engineering/pipeline/trigger`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subsystem_id: subsystemId }),
      },
    );

    const data = (await response.json()) as PipelineTriggerResponse;

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }
}

export const pipelineRepository = new PipelineApiRepository();
