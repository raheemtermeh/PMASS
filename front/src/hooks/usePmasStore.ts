"use client";

import { useSyncExternalStore } from "react";
import { store } from "@/legacy/state";

export function usePmasStore() {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.state,
    () => store.state,
  );
}
