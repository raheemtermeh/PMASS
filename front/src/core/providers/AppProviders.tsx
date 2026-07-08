"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "@/core/api/get-query-client";
import { TelemetryBootstrap } from "./TelemetryBootstrap";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TelemetryBootstrap />
      {children}
    </QueryClientProvider>
  );
}
