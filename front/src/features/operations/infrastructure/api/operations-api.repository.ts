import { httpClient } from "@/core/api/http-client";
import type {
  OperationalItemDto,
  OperationsRepository,
} from "../../domain/entities/operational-item";

export class OperationsApiRepository implements OperationsRepository {
  getItems(): Promise<OperationalItemDto[]> {
    return httpClient.get<OperationalItemDto[]>("/api/v1/operations/items");
  }

  async resolveBlocker(ticketCode: string): Promise<void> {
    await httpClient.post("/api/v1/operations/resolve", {
      ticket_code: ticketCode,
    });
  }
}

export const operationsRepository = new OperationsApiRepository();
