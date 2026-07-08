export interface CredentialDto {
  id: number;
  name: string;
  value: string;
  description: string;
  updated_at: string;
}

export interface CredentialSaveRequest {
  name: string;
  value: string;
  description: string;
}

export interface CredentialsRepository {
  getAll(): Promise<CredentialDto[]>;
  save(credential: CredentialSaveRequest): Promise<void>;
  delete(id: number): Promise<void>;
}
