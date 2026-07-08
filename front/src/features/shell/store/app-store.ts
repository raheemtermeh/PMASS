import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  DeleteCredentialUseCase,
  SaveCredentialUseCase,
  credentialsRepository,
} from "@/features/credentials";
import { TriggerPipelineUseCase, pipelineRepository } from "@/features/engineering";
import { ResolveBlockerUseCase, operationsRepository } from "@/features/operations";
import { PushAssetUseCase, uiuxRepository } from "@/features/uiux";
import { initialAppState } from "../domain/initial-state";
import type { AppState, StateUpdater } from "../domain/types";
import { deriveBlockers } from "../application/sync-blockers";
import { loadDatabaseTelemetry } from "../application/telemetry-sync";
import { startTelemetrySimulators } from "../application/telemetry-simulators";

const resolveBlockerUseCase = new ResolveBlockerUseCase(operationsRepository);
const triggerPipelineUseCase = new TriggerPipelineUseCase(pipelineRepository);
const pushAssetUseCase = new PushAssetUseCase(uiuxRepository);
const saveCredentialUseCase = new SaveCredentialUseCase(credentialsRepository);
const deleteCredentialUseCase = new DeleteCredentialUseCase(credentialsRepository);

type AppStore = AppState & {
  updateState: (updater: StateUpdater) => void;
  applyTelemetryPatch: (patch: Partial<AppState>) => void;
  syncBlockers: () => void;
  loadDatabaseTelemetry: () => Promise<boolean>;
  setView: (viewName: string) => void;
  toggleComplianceItem: (itemId: string) => void;
  resolveBlockerLocal: (blockerId: number | string) => void;
  resolveBlocker: (blockerId: number | string) => Promise<void>;
  resetBlockers: () => void;
  addBlocker: (
    title: string,
    severity: string,
    owner: string,
    details?: string,
  ) => void;
  addWorkspaceItem: (item: {
    title: string;
    type: string;
    severity: string;
    workspace: string;
    owner: string;
    status?: string;
    details?: string;
    targetWorkspace?: string | null;
  }) => void;
  updateWorkspaceItemStatus: (itemId: string, newStatus: string) => void;
  setUIUXDevice: (device: string) => void;
  setUIUXTab: (tab: string) => void;
  changeUIUXScale: (change: number) => void;
  setUIUXPage: (page: string) => void;
  pushAssetToCDNLocal: (assetName: string) => void;
  pushAssetToCDN: (assetName: string) => Promise<void>;
  updateUserProfile: (
    userUpdates: Partial<AppState["user"]>,
  ) => void;
  updateSettings: (settingsUpdates: Partial<AppState["settings"]>) => void;
  resetSettings: () => void;
  fetchCredentials: () => Promise<void>;
  saveCredential: (cred: {
    name: string;
    value: string;
    description: string;
  }) => Promise<void>;
  deleteCredential: (id: number) => Promise<void>;
  triggerPipelineRunLocal: () => void;
  triggerPipelineRun: () => Promise<void>;
  triggerPipelineRunAnimation: () => void;
  getCompliancePercent: () => number;
  bootstrapClient: () => void;
};

function applyUpdater(state: AppState, updater: StateUpdater): AppState {
  const patch = typeof updater === "function" ? updater(state) : updater;
  const next = { ...state, ...patch };

  if (patch.workspaceItems) {
    next.blockers = deriveBlockers(next.workspaceItems);
  }

  return next;
}

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialAppState,
    blockers: deriveBlockers(initialAppState.workspaceItems),

    updateState(updater) {
      set((state) => applyUpdater(state, updater));
    },

    applyTelemetryPatch(patch) {
      set((state) => ({ ...state, ...patch }));
    },

    syncBlockers() {
      set((state) => ({
        blockers: deriveBlockers(state.workspaceItems),
      }));
    },

    async loadDatabaseTelemetry() {
      return loadDatabaseTelemetry(
        (patch) => get().applyTelemetryPatch(patch),
        () => get(),
      );
    },

    setView(viewName) {
      get().updateState({ currentView: viewName });
    },

    toggleComplianceItem(itemId) {
      get().updateState((state) => ({
        complianceChecklist: state.complianceChecklist.map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item,
        ),
      }));
    },

    resolveBlockerLocal(blockerId) {
      get().updateState((state) => ({
        workspaceItems: state.workspaceItems.map((item) => {
          if (item.id === `item-${blockerId}` || item.id === blockerId) {
            return { ...item, status: "Resolved" };
          }
          return item;
        }),
      }));
    },

    async resolveBlocker(blockerId) {
      const numericId =
        parseInt(String(blockerId).replace("item-", ""), 10) || blockerId;
      const ticketCode = `BLK-${numericId}`;

      try {
        await resolveBlockerUseCase.execute(ticketCode);
        console.log(
          `[Telemetry Sync] Blocker ${ticketCode} resolved in Supabase DB.`,
        );
        await get().loadDatabaseTelemetry();
      } catch (error) {
        console.error("[Telemetry Sync] Resolve blocker failed:", error);
        get().resolveBlockerLocal(blockerId);
      }
    },

    resetBlockers() {
      get().updateState((state) => ({
        workspaceItems: state.workspaceItems.map((item) =>
          item.type === "blocker" ? { ...item, status: "Blocked" } : item,
        ),
      }));
    },

    addBlocker(title, severity, owner, details) {
      get().updateState((state) => {
        const nextId =
          state.workspaceItems.reduce(
            (max, item) =>
              Math.max(max, parseInt(item.id.replace("item-", ""), 10) || 0),
            0,
          ) + 1;

        let workspace = "executive";
        if (owner.includes("Infra")) workspace = "infrastructure";
        else if (owner.includes("Legal") || owner.includes("HR"))
          workspace = "legalhr";
        else if (owner.includes("UI") || owner.includes("UX"))
          workspace = "uiux";
        else if (owner.includes("Engineering") || owner.includes("Dev"))
          workspace = "engineering";
        else if (owner.includes("Finance")) workspace = "finance";
        else if (owner.includes("Marketing")) workspace = "marketing";

        return {
          workspaceItems: [
            ...state.workspaceItems,
            {
              id: `item-${nextId}`,
              type: "blocker",
              title,
              severity,
              workspace,
              owner,
              status: "Blocked",
              details: details || "No additional blocker details provided.",
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
    },

    addWorkspaceItem(item) {
      get().updateState((state) => {
        const nextId =
          state.workspaceItems.reduce(
            (max, workspaceItem) =>
              Math.max(
                max,
                parseInt(workspaceItem.id.replace("item-", ""), 10) || 0,
              ),
            0,
          ) + 1;

        return {
          workspaceItems: [
            ...state.workspaceItems,
            {
              id: `item-${nextId}`,
              title: item.title,
              type: item.type,
              severity: item.severity,
              workspace: item.workspace,
              owner: item.owner,
              status:
                item.type === "blocker"
                  ? "Blocked"
                  : item.status || "Backlog",
              details: item.details || "No details provided.",
              targetWorkspace: item.targetWorkspace || null,
              createdAt: new Date().toISOString(),
              completedAt: undefined,
            },
          ],
        };
      });
    },

    updateWorkspaceItemStatus(itemId, newStatus) {
      get().updateState((state) => ({
        workspaceItems: state.workspaceItems.map((item) => {
          if (item.id !== itemId) return item;

          const updated = { ...item, status: newStatus };
          if (newStatus === "Completed" || newStatus === "Resolved") {
            updated.completedAt = new Date().toISOString();
          } else {
            updated.completedAt = undefined;
          }
          return updated;
        }),
      }));
    },

    setUIUXDevice(device) {
      get().updateState((state) => ({
        uiuxView: { ...state.uiuxView, activeDevice: device },
      }));
    },

    setUIUXTab(tab) {
      get().updateState((state) => ({
        uiuxView: { ...state.uiuxView, activeTab: tab },
      }));
    },

    changeUIUXScale(change) {
      get().updateState((state) => {
        let newScale = state.uiuxView.scale + change;
        if (newScale < 50) newScale = 50;
        if (newScale > 150) newScale = 150;
        return {
          uiuxView: { ...state.uiuxView, scale: newScale },
        };
      });
    },

    setUIUXPage(page) {
      get().updateState((state) => ({
        uiuxView: { ...state.uiuxView, activePage: page },
      }));
    },

    pushAssetToCDNLocal(assetName) {
      get().updateState((state) => ({
        uiux: {
          ...state.uiux,
          assets: state.uiux.assets.map((asset) =>
            asset.name === assetName
              ? { ...asset, cdnStatus: "Syncing..." }
              : asset,
          ),
        },
      }));

      setTimeout(() => {
        get().updateState((state) => ({
          uiux: {
            ...state.uiux,
            assets: state.uiux.assets.map((asset) =>
              asset.name === assetName
                ? { ...asset, cdnStatus: "Live" }
                : asset,
            ),
          },
        }));
      }, 1500);
    },

    async pushAssetToCDN(assetName) {
      get().updateState((state) => ({
        uiux: {
          ...state.uiux,
          assets: state.uiux.assets.map((asset) =>
            asset.name === assetName
              ? { ...asset, cdnStatus: "Syncing..." }
              : asset,
          ),
        },
      }));

      try {
        await pushAssetUseCase.execute(assetName);
        get().updateState((state) => ({
          uiux: {
            ...state.uiux,
            assets: state.uiux.assets.map((asset) =>
              asset.name === assetName
                ? { ...asset, cdnStatus: "Live" }
                : asset,
            ),
          },
        }));
        console.log(
          `[Telemetry Sync] Asset ${assetName} pushed to CDN via backend.`,
        );
      } catch (error) {
        console.warn(
          "[Telemetry Sync] Backend unreachable, pushing asset locally.",
          error,
        );
        get().pushAssetToCDNLocal(assetName);
      }
    },

    updateUserProfile(userUpdates) {
      get().updateState((state) => {
        const name = userUpdates.name || state.user.name;
        const nameParts = name.trim().split(/\s+/);
        let initials = "";
        if (nameParts.length > 0) {
          initials += nameParts[0].charAt(0).toUpperCase();
          if (nameParts.length > 1) {
            initials += nameParts[nameParts.length - 1].charAt(0).toUpperCase();
          }
        }
        if (!initials) initials = "U";

        return {
          user: {
            ...state.user,
            ...userUpdates,
            avatarText: initials,
          },
        };
      });
    },

    updateSettings(settingsUpdates) {
      get().updateState((state) => ({
        settings: { ...state.settings, ...settingsUpdates },
      }));
    },

    resetSettings() {
      get().updateState({
        settings: {
          notificationAlerts: true,
          simulationSpeed: "normal",
          complianceThreshold: 75,
          compactMode: false,
          sidebarCollapsed: false,
        },
      });
    },

    async fetchCredentials() {
      try {
        const creds = await credentialsRepository.getAll();
        get().updateState({ credentials: creds });
      } catch (error) {
        console.warn("[Credentials] Failed to fetch credentials:", error);
      }
    },

    async saveCredential(cred) {
      await saveCredentialUseCase.execute(cred);
      await get().fetchCredentials();
    },

    async deleteCredential(id) {
      await deleteCredentialUseCase.execute(id);
      await get().fetchCredentials();
    },

    triggerPipelineRunLocal() {
      const stages = ["Build", "Lint", "Test", "Deploy"];
      let stageIndex = 0;

      const interval = setInterval(() => {
        get().updateState((state) => {
          const { logs, coverage } = state.pipeline;
          let { progress, stage } = state.pipeline;
          progress += 15;

          if (progress >= 100) {
            progress = 0;
            stageIndex++;

            if (stageIndex >= stages.length) {
              clearInterval(interval);
              logs.push(
                `[Deploy] Syncing bundle structures to S3 CDN edge servers...`,
              );
              logs.push(
                `[Deploy] Ingress router mapping updated. Live deployment completed!`,
              );
              logs.push(`[System] Pipeline SUCCESS. Built and verified in 12s.`);

              const deltaCoverage = Math.random() * 0.8 - 0.4;
              const newCoverage = Math.min(
                100,
                Math.max(
                  50,
                  parseFloat((coverage + deltaCoverage).toFixed(2)),
                ),
              );

              return {
                pipeline: {
                  ...state.pipeline,
                  status: "Success",
                  stage: "None",
                  progress: 100,
                  logs,
                  coverage: newCoverage,
                },
              };
            }

            stage = stages[stageIndex];
            logs.push(
              `[System] Stage ${stages[stageIndex - 1]} success. Transitioning to ${stage}...`,
            );
            if (stage === "Lint") {
              logs.push(
                `[Lint] Running ESLint configurations over 412 script modules...`,
              );
              logs.push(
                `[Lint] 0 errors, 4 warnings identified. Style checks passed.`,
              );
            } else if (stage === "Test") {
              logs.push(
                `[Test] Running Jest test suites. Found 1,294 matching test cases...`,
              );
              logs.push(
                `[Test] Completed E2E verification matrix on Chromium headless.`,
              );
            } else if (stage === "Deploy") {
              logs.push(
                `[Deploy] Bundling production build files. Size: 1.48 MB.`,
              );
            }
          }

          return {
            pipeline: {
              ...state.pipeline,
              stage,
              progress,
              logs: [...logs],
            },
          };
        });
      }, 1500);
    },

    async triggerPipelineRun() {
      if (get().pipeline.status === "Running") return;

      const subsystemId = 3;

      get().updateState((state) => ({
        pipeline: {
          ...state.pipeline,
          status: "Running",
          stage: "Build",
          progress: 10,
          rcaMessage: "",
          logs: [
            `[System] Initializing PMAS pipeline run #${state.pipeline.buildCount + 1}...`,
            `[System] Querying Supabase database for active compilation barriers...`,
            `[System] Pinging compiler cluster gates...`,
          ],
          buildCount: state.pipeline.buildCount + 1,
        },
      }));

      try {
        const result = await triggerPipelineUseCase.execute(subsystemId);
        const data = result.data;

        if (result.status === 400 && data.rca) {
          setTimeout(() => {
            get().updateState((state) => {
              const rca = data.rca!;
              const logMsg = [
                ...state.pipeline.logs,
                `[Compiler Error] Halting compilation: Active blocker ${rca.blocker_ticket} (${rca.summary}) blocks pipeline.`,
                `[AI RCA Log] Root Cause: ${rca.root_cause}`,
                `[AI RCA Log] Remediation: ${rca.remediation}`,
                `[System] Compilation FAILED. Build halted.`,
              ];
              const rcaMsg = `Compilation halted due to unresolved blocker (${rca.blocker_ticket} - ${rca.summary}). Root Cause: ${rca.root_cause}. Remediation: ${rca.remediation}`;

              return {
                pipeline: {
                  ...state.pipeline,
                  status: "Failed",
                  stage: "None",
                  progress: 0,
                  logs: logMsg,
                  rcaMessage: rcaMsg,
                },
              };
            });
          }, 1200);
        } else if (result.ok) {
          setTimeout(() => {
            get().updateState((state) => ({
              pipeline: {
                ...state.pipeline,
                logs: [
                  ...state.pipeline.logs,
                  `[System] Compilation checks passed. Starting bundle assembly...`,
                ],
              },
            }));
            get().triggerPipelineRunAnimation();
          }, 1000);
        } else {
          get().triggerPipelineRunLocal();
        }
      } catch (error) {
        console.warn(
          "[Telemetry Sync] Backend unreachable, triggering local simulation.",
          error,
        );
        get().triggerPipelineRunLocal();
      }
    },

    triggerPipelineRunAnimation() {
      const stages = ["Build", "Lint", "Test", "Deploy"];
      let stageIndex = 0;
      const interval = setInterval(() => {
        get().updateState((state) => {
          const { logs, coverage } = state.pipeline;
          let { progress, stage } = state.pipeline;
          progress += 20;

          if (progress >= 100) {
            progress = 0;
            stageIndex++;

            if (stageIndex >= stages.length) {
              clearInterval(interval);
              logs.push(
                `[Deploy] Syncing bundle structures to S3 CDN edge servers...`,
              );
              logs.push(
                `[Deploy] Ingress router mapping updated. Live deployment completed!`,
              );
              logs.push(`[System] Pipeline SUCCESS. Built and verified in 12s.`);

              const deltaCoverage = Math.random() * 0.8 - 0.4;
              const newCoverage = Math.min(
                100,
                Math.max(
                  50,
                  parseFloat((coverage + deltaCoverage).toFixed(2)),
                ),
              );

              return {
                pipeline: {
                  ...state.pipeline,
                  status: "Success",
                  stage: "None",
                  progress: 100,
                  logs,
                  coverage: newCoverage,
                },
              };
            }

            stage = stages[stageIndex];
            logs.push(
              `[System] Stage ${stages[stageIndex - 1]} success. Transitioning to ${stage}...`,
            );
            if (stage === "Lint") {
              logs.push(
                `[Lint] Running ESLint configurations over 412 script modules...`,
              );
              logs.push(
                `[Lint] 0 errors, 4 warnings identified. Style checks passed.`,
              );
            } else if (stage === "Test") {
              logs.push(
                `[Test] Running Jest test suites. Found 1,294 matching test cases...`,
              );
              logs.push(
                `[Test] Completed E2E verification matrix on Chromium headless.`,
              );
            } else if (stage === "Deploy") {
              logs.push(
                `[Deploy] Bundling production build files. Size: 1.48 MB.`,
              );
            }
          }

          return {
            pipeline: {
              ...state.pipeline,
              stage,
              progress,
              logs: [...logs],
            },
          };
        });
      }, 1200);
    },

    getCompliancePercent() {
      const checklist = get().complianceChecklist;
      const checked = checklist.filter((item) => item.checked).length;
      return Math.round((checked / checklist.length) * 100);
    },

    bootstrapClient() {
      startTelemetrySimulators(
        () => get(),
        (updater) => get().updateState(updater),
      );
    },
  })),
);
