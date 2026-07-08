import type {
  MarketingCampaign,
  MarketingCampaignDto,
  MarketingRepository,
} from "../../domain/entities/campaign";

export class GetMarketingCampaignsUseCase {
  constructor(private readonly repository: MarketingRepository) {}

  async execute(): Promise<MarketingCampaign[]> {
    const campaigns = await this.repository.getCampaigns();
    return campaigns.map((campaign: MarketingCampaignDto) => ({
      name: campaign.name,
      leads: campaign.leads,
      conversion: campaign.conversion,
      spend: campaign.spend,
      status: campaign.status,
    }));
  }
}
