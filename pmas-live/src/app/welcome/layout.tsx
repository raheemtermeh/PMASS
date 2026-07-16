import type { ReactNode } from "react";

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return <div className="landing-root">{children}</div>;
}
