"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface OnboardingState {
  /** userId -> completed */
  completedByUser: Record<string, boolean>;
  /** Force-open wizard from Help */
  forceOpen: boolean;
  markCompleted: (userId: string) => void;
  resetForUser: (userId: string) => void;
  setForceOpen: (open: boolean) => void;
  isCompleted: (userId: string) => boolean;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedByUser: {},
      forceOpen: false,
      markCompleted: (userId) =>
        set((s) => ({
          completedByUser: { ...s.completedByUser, [userId]: true },
          forceOpen: false,
        })),
      resetForUser: (userId) =>
        set((s) => {
          const next = { ...s.completedByUser };
          delete next[userId];
          return { completedByUser: next, forceOpen: true };
        }),
      setForceOpen: (open) => set({ forceOpen: open }),
      isCompleted: (userId) => Boolean(get().completedByUser[userId]),
    }),
    {
      name: "pmas-live-onboarding",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ completedByUser: s.completedByUser }),
    },
  ),
);

interface PmProgressState {
  checkedByUser: Record<string, string[]>;
  toggle: (userId: string, capabilityId: string) => void;
  isChecked: (userId: string, capabilityId: string) => boolean;
  checkedCount: (userId: string, ids: string[]) => number;
}

export const usePmProgressStore = create<PmProgressState>()(
  persist(
    (set, get) => ({
      checkedByUser: {},
      toggle: (userId, capabilityId) =>
        set((s) => {
          const current = new Set(s.checkedByUser[userId] ?? []);
          if (current.has(capabilityId)) current.delete(capabilityId);
          else current.add(capabilityId);
          return {
            checkedByUser: {
              ...s.checkedByUser,
              [userId]: Array.from(current),
            },
          };
        }),
      isChecked: (userId, capabilityId) =>
        (get().checkedByUser[userId] ?? []).includes(capabilityId),
      checkedCount: (userId, ids) => {
        const setIds = new Set(get().checkedByUser[userId] ?? []);
        return ids.filter((id) => setIds.has(id)).length;
      },
    }),
    {
      name: "pmas-live-pm-progress",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
