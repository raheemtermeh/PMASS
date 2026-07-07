"use client";

import { LegacyView } from "@/components/LegacyView";
import { legacyViewLoaders } from "@/lib/legacyViews";
import type { ViewId } from "@/lib/routes";

interface LegacyViewPageProps {
  viewId: ViewId;
}

export function LegacyViewPage({ viewId }: LegacyViewPageProps) {
  return <LegacyView loadView={legacyViewLoaders[viewId]} />;
}
