"use client";

import { useAppStore } from "@/features/shell/store/app-store";
import { useShallow } from "zustand/react/shallow";

export function usePmasStore() {
  return useAppStore(useShallow((state) => state));
}

export function usePmasSelector<T>(selector: (state: ReturnType<typeof useAppStore.getState>) => T): T {
  return useAppStore(selector);
}
