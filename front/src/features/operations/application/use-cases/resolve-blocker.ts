import type { OperationsRepository } from "../../domain/entities/operational-item";

export class ResolveBlockerUseCase {
  constructor(private readonly repository: OperationsRepository) {}

  execute(ticketCode: string) {
    return this.repository.resolveBlocker(ticketCode);
  }
}
