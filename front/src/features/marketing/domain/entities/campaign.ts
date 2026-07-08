export interface MarketingCampaignDto {
  id: number;
  name: string;
  leads: number;
  conversion: number;
  spend: number;
  status: string;
  dependent_subsystem_id: number | null;
  dependent_subsystem_status?: string;
}

export interface MarketingCampaign {
  name: string;
  leads: number;
  conversion: number;
  spend: number;
  status: string;
}

export interface MarketingRepository {
  getCampaigns(): Promise<MarketingCampaignDto[]>;
}
