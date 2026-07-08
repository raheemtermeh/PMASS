import type { SubsystemRepository } from "../../domain/entities/subsystem";

export class GetSubsystemsUseCase {
  constructor(private readonly repository: SubsystemRepository) {}

  execute() {
    return this.repository.getAll();
  }
}
