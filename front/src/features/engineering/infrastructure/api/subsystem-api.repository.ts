import { httpClient } from "@/core/api/http-client";
import type { Subsystem, SubsystemRepository } from "../../domain/entities/subsystem";

export class SubsystemApiRepository implements SubsystemRepository {
  getAll(): Promise<Subsystem[]> {
    return httpClient.get<Subsystem[]>("/api/v1/engineering/subsystems");
  }
}

export const subsystemRepository = new SubsystemApiRepository();
