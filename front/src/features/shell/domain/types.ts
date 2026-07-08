import type { CredentialDto } from "@/features/credentials";
import type { Subsystem } from "@/features/engineering";
import type { DesignTokens } from "@/features/uiux";

export type WorkspaceId =
  | "executive"
  | "uiux"
  | "engineering"
  | "infrastructure"
  | "marketing"
  | "finance"
  | "legalhr";

export interface UserProfile {
  name: string;
  role: string;
  avatarText: string;
  email: string;
  department: string;
  bio: string;
  avatarColor: string;
}

export interface AppSettings {
  notificationAlerts: boolean;
  simulationSpeed: "normal" | "fast" | "slow" | "paused";
  complianceThreshold: number;
  compactMode: boolean;
  sidebarCollapsed: boolean;
}

export interface ComplianceItem {
  id: string;
  category: string;
  text: string;
  checked: boolean;
}

export interface WorkspaceItem {
  id: string;
  type: string;
  title: string;
  severity: string;
  workspace: WorkspaceId | string;
  owner: string;
  status: string;
  details: string;
  createdAt: string;
  completedAt?: string;
  targetWorkspace?: string | null;
}

export interface BlockerItem {
  id: number | string;
  title: string;
  severity: string;
  owner: string;
  status: string;
  details: string;
}

export interface PipelineState {
  status: string;
  stage: string;
  progress: number;
  logs: string[];
  lastDuration: string;
  coverage: number;
  buildCount: number;
  rcaMessage?: string;
}

export interface TechStackService {
  name: string;
  status: string;
  version: string;
  memory: string;
  uptime: string;
}

export interface ClusterNode {
  name: string;
  region: string;
  status: string;
  cpu: number;
  ram: number;
  disk: number;
  host: string;
}

export interface UiuxViewState {
  activeDevice: string;
  scale: number;
  activeTab: string;
  activePage: string;
  designSystemAlignment: number;
}

export interface MarketingCampaignView {
  name: string;
  leads: number;
  conversion: number;
  spend: number;
  status: string;
}

export interface AppState {
  currentView: string;
  user: UserProfile;
  settings: AppSettings;
  credentials: CredentialDto[];
  complianceChecklist: ComplianceItem[];
  workspaceItems: WorkspaceItem[];
  blockers: BlockerItem[];
  pipeline: PipelineState;
  techStack: TechStackService[];
  clusterNodes: ClusterNode[];
  uiuxView: UiuxViewState;
  uiux: {
    tokens: DesignTokens;
    assets: Array<{
      name: string;
      size: string;
      cdnStatus: string;
      date: string;
    }>;
  };
  finance: {
    capex: number;
    opex: number;
    burnRate: number;
    forecastQ3: number;
    actualQ2: number;
  };
  marketing: {
    campaigns: MarketingCampaignView[];
  };
  subsystems?: Subsystem[];
}

export type StateUpdater =
  | Partial<AppState>
  | ((state: AppState) => Partial<AppState>);
