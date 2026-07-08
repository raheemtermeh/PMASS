import { httpClient } from "@/core/api/http-client";
import type {
  CredentialDto,
  CredentialSaveRequest,
  CredentialsRepository,
} from "../../domain/entities/credential";

export class CredentialsApiRepository implements CredentialsRepository {
  getAll(): Promise<CredentialDto[]> {
    return httpClient.get<CredentialDto[]>("/api/v1/credentials");
  }

  save(credential: CredentialSaveRequest): Promise<void> {
    return httpClient.post<void>("/api/v1/credentials", credential);
  }

  delete(id: number): Promise<void> {
    return httpClient.delete<void>(`/api/v1/credentials?id=${id}`);
  }
}

export const credentialsRepository = new CredentialsApiRepository();
