import type { UiuxRepository } from "../../domain/entities/uiux";

export class PushAssetUseCase {
  constructor(private readonly repository: UiuxRepository) {}

  execute(assetName: string) {
    return this.repository.pushAsset(assetName);
  }
}
