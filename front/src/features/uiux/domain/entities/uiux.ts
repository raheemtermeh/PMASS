export type DesignTokens = Record<string, Record<string, unknown>>;

export interface UiuxAsset {
  name: string;
  size: string;
  cdnStatus: string;
  date: string;
}

export interface UiuxRepository {
  getTokens(): Promise<DesignTokens>;
  pushAsset(assetName: string): Promise<void>;
}
