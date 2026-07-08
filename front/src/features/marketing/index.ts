export { marketingRepository } from "./infrastructure/api/marketing-api.repository";
export { GetMarketingCampaignsUseCase } from "./application/use-cases/get-marketing-campaigns";
export type {
  MarketingCampaign,
  MarketingCampaignDto,
} from "./domain/entities/campaign";
