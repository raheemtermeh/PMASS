"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "@/core/api/query-keys";
import {
  applyTelemetrySnapshot,
  fetchTelemetrySnapshot,
} from "@/features/shell/application/telemetry-sync";
import { useAppStore } from "@/features/shell/store/app-store";

export function TelemetryBootstrap() {
  const applyTelemetryPatch = useAppStore((state) => state.applyTelemetryPatch);

  const { data } = useQuery({
    queryKey: queryKeys.telemetry,
    queryFn: fetchTelemetrySnapshot,
    retry: 1,
  });

  useEffect(() => {
    useAppStore.getState().bootstrapClient();
  }, []);

  useEffect(() => {
    if (!data) return;
    const current = useAppStore.getState();
    applyTelemetryPatch(applyTelemetrySnapshot(current, data));
  }, [applyTelemetryPatch, data]);

  return null;
}
