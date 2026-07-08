import type { CredentialsRepository } from "../../domain/entities/credential";

export class DeleteCredentialUseCase {
  constructor(private readonly repository: CredentialsRepository) {}

  execute(id: number) {
    return this.repository.delete(id);
  }
}
