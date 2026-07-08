import type {
  CredentialSaveRequest,
  CredentialsRepository,
} from "../../domain/entities/credential";

export class SaveCredentialUseCase {
  constructor(private readonly repository: CredentialsRepository) {}

  execute(credential: CredentialSaveRequest) {
    return this.repository.save(credential);
  }
}
