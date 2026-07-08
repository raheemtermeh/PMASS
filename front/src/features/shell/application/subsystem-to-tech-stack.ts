import type { Subsystem } from "@/features/engineering";
import type { TechStackService } from "../domain/types";

const TECH_STACK_META: Record<
  string,
  { version: string; memory: string; uptime: string }
> = {
  executive: { version: "v1.4", memory: "15MB", uptime: "100.00%" },
  uiux: { version: "v3.4.4", memory: "18MB", uptime: "100.00%" },
  engineering: { version: "v20.12.2", memory: "240MB", uptime: "99.98%" },
  infrastructure: { version: "v26.1.3", memory: "1.2GB", uptime: "99.92%" },
};

export function mapSubsystemsToTechStack(
  subsystems: Subsystem[],
): TechStackService[] {
  return subsystems.map((sub) => {
    const meta = TECH_STACK_META[sub.slug] ?? {
      version: "v1.0.0",
      memory: "20MB",
      uptime: "99.9%",
    };

    return {
      name: sub.name,
      status: sub.status.charAt(0).toUpperCase() + sub.status.slice(1),
      version: meta.version,
      memory: meta.memory,
      uptime: meta.uptime,
    };
  });
}
