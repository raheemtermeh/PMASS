import type { OperationsRepository } from "../../domain/entities/operational-item";
import { mapOperationalItemToWorkspaceItem } from "../mappers/operational-item.mapper";

export class GetOperationsItemsUseCase {
  constructor(private readonly repository: OperationsRepository) {}

  async execute() {
    const items = await this.repository.getItems();
    return items.map(mapOperationalItemToWorkspaceItem);
  }
}
