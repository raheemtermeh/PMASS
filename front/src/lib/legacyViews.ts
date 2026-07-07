import type { ViewId } from "@/lib/routes";

type LegacyViewModule = {
  render: (container: HTMLElement) => void;
};

export const legacyViewLoaders: Record<
  ViewId,
  () => Promise<LegacyViewModule>
> = {
  executive: () => import("@/legacy/views/executive"),
  uiux: () => import("@/legacy/views/uiux"),
  engineering: () => import("@/legacy/views/engineering"),
  infrastructure: () => import("@/legacy/views/infrastructure"),
  marketing: () => import("@/legacy/views/marketing"),
  "graph-view": () => import("@/legacy/views/graphview"),
  finance: () => import("@/legacy/views/finance"),
  legalhr: () => import("@/legacy/views/legalhr"),
  profile: () => import("@/legacy/views/profile"),
  settings: () => import("@/legacy/views/settings"),
};
