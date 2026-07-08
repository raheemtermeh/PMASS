import type { AppState, StateUpdater } from "../domain/types";
import { useAppStore } from "./app-store";

type LegacyCallback = (state: AppState) => void;

/**
 * Backward-compatible facade for legacy vanilla JS views.
 * New React code should use `useAppStore` directly with selectors.
 */
class StateFacade {
  get state(): AppState {
    return useAppStore.getState();
  }

  subscribe(callback: LegacyCallback) {
    return useAppStore.subscribe((state) => callback(state));
  }

  notify() {
    // Zustand notifies subscribers automatically on state updates.
  }

  updateState(updater: StateUpdater) {
    useAppStore.getState().updateState(updater);
  }

  async loadDatabaseTelemetry() {
    return useAppStore.getState().loadDatabaseTelemetry();
  }

  syncBlockers() {
    useAppStore.getState().syncBlockers();
  }

  setView(viewName: string) {
    useAppStore.getState().setView(viewName);
  }

  toggleComplianceItem(itemId: string) {
    useAppStore.getState().toggleComplianceItem(itemId);
  }

  resolveBlockerLocal(blockerId: number | string) {
    useAppStore.getState().resolveBlockerLocal(blockerId);
  }

  resolveBlocker(blockerId: number | string) {
    return useAppStore.getState().resolveBlocker(blockerId);
  }

  resetBlockers() {
    useAppStore.getState().resetBlockers();
  }

  addBlocker(
    title: string,
    severity: string,
    owner: string,
    details?: string,
  ) {
    useAppStore.getState().addBlocker(title, severity, owner, details);
  }

  addWorkspaceItem(item: {
    title: string;
    type: string;
    severity: string;
    workspace: string;
    owner: string;
    status?: string;
    details?: string;
    targetWorkspace?: string | null;
  }) {
    useAppStore.getState().addWorkspaceItem(item);
  }

  updateWorkspaceItemStatus(itemId: string, newStatus: string) {
    useAppStore.getState().updateWorkspaceItemStatus(itemId, newStatus);
  }

  setUIUXDevice(device: string) {
    useAppStore.getState().setUIUXDevice(device);
  }

  setUIUXTab(tab: string) {
    useAppStore.getState().setUIUXTab(tab);
  }

  changeUIUXScale(change: number) {
    useAppStore.getState().changeUIUXScale(change);
  }

  setUIUXPage(page: string) {
    useAppStore.getState().setUIUXPage(page);
  }

  pushAssetToCDNLocal(assetName: string) {
    useAppStore.getState().pushAssetToCDNLocal(assetName);
  }

  pushAssetToCDN(assetName: string) {
    return useAppStore.getState().pushAssetToCDN(assetName);
  }

  updateUserProfile(userUpdates: Partial<AppState["user"]>) {
    useAppStore.getState().updateUserProfile(userUpdates);
  }

  updateSettings(settingsUpdates: Partial<AppState["settings"]>) {
    useAppStore.getState().updateSettings(settingsUpdates);
  }

  resetSettings() {
    useAppStore.getState().resetSettings();
  }

  fetchCredentials() {
    return useAppStore.getState().fetchCredentials();
  }

  saveCredential(cred: { name: string; value: string; description: string }) {
    return useAppStore.getState().saveCredential(cred);
  }

  deleteCredential(id: number) {
    return useAppStore.getState().deleteCredential(id);
  }

  triggerPipelineRunLocal() {
    useAppStore.getState().triggerPipelineRunLocal();
  }

  triggerPipelineRun() {
    return useAppStore.getState().triggerPipelineRun();
  }

  triggerPipelineRunAnimation() {
    useAppStore.getState().triggerPipelineRunAnimation();
  }

  getCompliancePercent() {
    return useAppStore.getState().getCompliancePercent();
  }
}

export const store = new StateFacade();

if (typeof window !== "undefined") {
  window.__pmasStore = store;
}
