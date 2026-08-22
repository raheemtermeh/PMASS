"use client";

import { useEffect, useState } from "react";

/** True when the browser tab is visible (Page Visibility API). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

/**
 * Returns `intervalMs` while the tab is visible, otherwise `false` so React Query
 * pauses polling — avoids background dashboard/API load without changing contracts.
 */
export function useVisibleRefetchInterval(intervalMs: number): number | false {
  const visible = usePageVisible();
  return visible ? intervalMs : false;
}
