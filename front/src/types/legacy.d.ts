export {};

declare global {
  interface Window {
    __pmasStore?: unknown;
    __executiveFilterValue?: string;
    __selectedGraphNode?: string;
    __graphNodePositions?: Record<string, { x: number; y: number }>;
    __graphZoomScale?: number;
    __graphPanX?: number;
    __graphPanY?: number;
    __expandedBlockers?: Set<string>;
    __graphViewState?: {
      perspective: string;
      selectedNodeId: string;
      panX: number;
      panY: number;
      scale: number;
    };
    __activeContainerLogName?: string;
    __workspaceBoardTabs?: Record<string, string>;
    __expandedBoardRows?: Set<string>;
    __settingsAlertTimeout?: ReturnType<typeof setTimeout>;
  }

  interface HTMLElement {
    _cleanupEvents?: (() => void) | null;
  }
}
