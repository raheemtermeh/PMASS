import { httpClient } from "@/core/api/http-client";
import type { DesignTokens, UiuxRepository } from "../../domain/entities/uiux";

export class UiuxApiRepository implements UiuxRepository {
  getTokens(): Promise<DesignTokens> {
    return httpClient.get<DesignTokens>("/api/v1/uiux/tokens");
  }

  pushAsset(assetName: string): Promise<void> {
    return httpClient.post<void>("/api/v1/uiux/assets/push", {
      asset_name: assetName,
    });
  }
}

export const uiuxRepository = new UiuxApiRepository();
