import type { AppState } from "../domain/types";

let simulatorIntervalId: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

export function startTelemetrySimulators(
  getState: () => AppState,
  updateState: (updater: (state: AppState) => Partial<AppState>) => void,
) {
  if (simulatorIntervalId !== null) return;

  simulatorIntervalId = setInterval(() => {
    const speed = getState().settings?.simulationSpeed || "normal";
    if (speed === "paused") return;

    tickCount++;
    const threshold = speed === "fast" ? 1 : speed === "slow" ? 8 : 4;
    if (tickCount % threshold !== 0) return;

    updateState((state) => {
      const clusterNodes = state.clusterNodes.map((node) => {
        const cpuDelta = Math.floor(Math.random() * 9) - 4;
        const ramDelta = Math.floor(Math.random() * 5) - 2;

        let cpu = node.cpu + cpuDelta;
        let ram = node.ram + ramDelta;

        if (cpu < 5) cpu = 5;
        if (cpu > 98) cpu = 98;
        if (ram < 10) ram = 10;
        if (ram > 98) ram = 98;

        return { ...node, cpu, ram };
      });

      const techStack = state.techStack.map((service) => {
        if (service.name === "Docker Gateway Slots") {
          const memoryVal = parseFloat(service.memory);
          const delta = Math.random() * 0.1 - 0.05;
          const newMem = Math.max(0.5, memoryVal + delta).toFixed(2);
          return { ...service, memory: `${newMem}GB` };
        }
        if (service.name === "React SPA Client") {
          const memoryVal = parseInt(service.memory, 10);
          const delta = Math.floor(Math.random() * 3) - 1;
          const newMem = Math.max(20, memoryVal + delta);
          return { ...service, memory: `${newMem}MB` };
        }
        return service;
      });

      const currentAlignment = state.uiuxView.designSystemAlignment || 94.6;
      const alignmentDelta = Math.random() * 0.1 - 0.05;
      let designSystemAlignment = Math.min(
        100,
        Math.max(90, currentAlignment + alignmentDelta),
      );
      designSystemAlignment = parseFloat(designSystemAlignment.toFixed(2));

      return {
        clusterNodes,
        techStack,
        uiuxView: {
          ...state.uiuxView,
          designSystemAlignment,
        },
      };
    });
  }, 1000);
}
