import type { PipelineRepository } from "../../domain/entities/pipeline";

export class TriggerPipelineUseCase {
  constructor(private readonly repository: PipelineRepository) {}

  execute(subsystemId: number) {
    return this.repository.trigger(subsystemId);
  }
}
