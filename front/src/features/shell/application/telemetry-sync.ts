import { GetCredentialsUseCase, credentialsRepository } from "@/features/credentials";
import { GetSubsystemsUseCase, subsystemRepository } from "@/features/engineering";
import { GetMarketingCampaignsUseCase, marketingRepository } from "@/features/marketing";
import { GetOperationsItemsUseCase, operationsRepository } from "@/features/operations";
import { GetDesignTokensUseCase, uiuxRepository } from "@/features/uiux";
import type { DesignTokens } from "@/features/uiux";
import type { CredentialDto } from "@/features/credentials";
import type { Subsystem } from "@/features/engineering";
import { mapSubsystemsToTechStack } from "./subsystem-to-tech-stack";
import { deriveBlockers } from "./sync-blockers";
import type { AppState, WorkspaceItem } from "../domain/types";

const getDesignTokens = new GetDesignTokensUseCase(uiuxRepository);
const getMarketingCampaigns = new GetMarketingCampaignsUseCase(marketingRepository);
const getSubsystems = new GetSubsystemsUseCase(subsystemRepository);
const getOperationsItems = new GetOperationsItemsUseCase(operationsRepository);
const getCredentials = new GetCredentialsUseCase(credentialsRepository);

export interface TelemetrySnapshot {
  tokens?: DesignTokens;
  campaigns?: AppState["marketing"]["campaigns"];
  subsystems?: Subsystem[];
  techStack?: AppState["techStack"];
  workspaceItems?: WorkspaceItem[];
  blockers?: AppState["blockers"];
  credentials?: CredentialDto[];
}

export async function fetchTelemetrySnapshot(): Promise<TelemetrySnapshot> {
  const [tokensResult, campaignsResult, subsystemsResult, itemsResult, credentialsResult] =
    await Promise.allSettled([
      getDesignTokens.execute(),
      getMarketingCampaigns.execute(),
      getSubsystems.execute(),
      getOperationsItems.execute(),
      getCredentials.execute(),
    ]);

  const snapshot: TelemetrySnapshot = {};

  if (tokensResult.status === "fulfilled") {
    snapshot.tokens = tokensResult.value;
  }

  if (campaignsResult.status === "fulfilled") {
    snapshot.campaigns = campaignsResult.value;
  }

  if (subsystemsResult.status === "fulfilled") {
    snapshot.subsystems = subsystemsResult.value;
    snapshot.techStack = mapSubsystemsToTechStack(subsystemsResult.value);
  }

  if (itemsResult.status === "fulfilled") {
    snapshot.workspaceItems = itemsResult.value;
    snapshot.blockers = deriveBlockers(itemsResult.value);
  }

  if (credentialsResult.status === "fulfilled") {
    snapshot.credentials = credentialsResult.value;
  }

  return snapshot;
}

export function applyTelemetrySnapshot(
  current: AppState,
  snapshot: TelemetrySnapshot,
): Partial<AppState> {
  const patch: Partial<AppState> = {};

  if (snapshot.tokens) {
    patch.uiux = {
      ...current.uiux,
      tokens: snapshot.tokens,
    };
  }

  if (snapshot.campaigns) {
    patch.marketing = { campaigns: snapshot.campaigns };
  }

  if (snapshot.subsystems) {
    patch.subsystems = snapshot.subsystems;
  }

  if (snapshot.techStack) {
    patch.techStack = snapshot.techStack;
  }

  if (snapshot.workspaceItems) {
    patch.workspaceItems = snapshot.workspaceItems;
  }

  if (snapshot.blockers) {
    patch.blockers = snapshot.blockers;
  }

  if (snapshot.credentials) {
    patch.credentials = snapshot.credentials;
  }

  return patch;
}

export async function loadDatabaseTelemetry(
  applyPatch: (patch: Partial<AppState>) => void,
  getState: () => AppState,
): Promise<boolean> {
  try {
    const snapshot = await fetchTelemetrySnapshot();
    applyPatch(applyTelemetrySnapshot(getState(), snapshot));
    console.log("[Telemetry Sync] Telemetry data synchronized with Supabase DB.");
    return true;
  } catch (error) {
    console.warn(
      "[Telemetry Sync] Backend service unreachable. Defaulting to mock local telemetry.",
      error,
    );
    return false;
  }
}
