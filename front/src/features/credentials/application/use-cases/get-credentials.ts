import type { CredentialsRepository } from "../../domain/entities/credential";

export class GetCredentialsUseCase {
  constructor(private readonly repository: CredentialsRepository) {}

  execute() {
    return this.repository.getAll();
  }
}
