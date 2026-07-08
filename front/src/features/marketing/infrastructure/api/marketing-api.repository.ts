import { httpClient } from "@/core/api/http-client";
import type {
  MarketingCampaignDto,
  MarketingRepository,
} from "../../domain/entities/campaign";

export class MarketingApiRepository implements MarketingRepository {
  getCampaigns(): Promise<MarketingCampaignDto[]> {
    return httpClient.get<MarketingCampaignDto[]>("/api/v1/marketing/campaigns");
  }
}

export const marketingRepository = new MarketingApiRepository();
