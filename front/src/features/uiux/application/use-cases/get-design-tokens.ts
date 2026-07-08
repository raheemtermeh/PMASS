import type { UiuxRepository } from "../../domain/entities/uiux";

export class GetDesignTokensUseCase {
  constructor(private readonly repository: UiuxRepository) {}

  execute() {
    return this.repository.getTokens();
  }
}
