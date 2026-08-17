"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/core/providers/I18nProvider";

interface PmasLoaderProps {
  message?: string;
  /** Compact inline variant for overlays; full-screen by default */
  variant?: "fullscreen" | "inline";
}

/**
 * Approaches 100% asymptotically so the bar always advances but never claims to
 * be finished before the real work is.
 */
function useCreepingProgress(enabled: boolean): number {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      setProgress((current) => current + Math.max(0.6, (96 - current) * 0.08));
    }, 220);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return Math.min(progress, 96);
}

export function PmasLoader({
  message,
  variant = "fullscreen",
}: PmasLoaderProps) {
  const { t } = useI18n();
  const resolvedMessage = message ?? t("loader.loading");
  const isFullscreen = variant === "fullscreen";
  const progress = useCreepingProgress(isFullscreen);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const timer = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  return (
    <div
      className={`pmas-loader${isFullscreen ? "" : " pmas-loader-inline"}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pmas-loader-stage" aria-hidden="true">
        <div className="pmas-loader-orb pmas-loader-orb-a" />
        <div className="pmas-loader-orb pmas-loader-orb-b" />
        <div className="pmas-loader-ring pmas-loader-ring-outer" />
        <div className="pmas-loader-ring pmas-loader-ring-mid" />
        <div className="pmas-loader-ring pmas-loader-ring-inner" />
        <div className="pmas-loader-core">
          <svg
            className="pmas-loader-shield"
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="pmas-loader-pulse" />
        </div>
        {isFullscreen ? (
          <>
            <span className="pmas-loader-satellite pmas-loader-satellite-a" />
            <span className="pmas-loader-satellite pmas-loader-satellite-b" />
          </>
        ) : null}
      </div>

      <div className="pmas-loader-copy">
        <p className="pmas-loader-brand">
          <span className="pmas-loader-brand-mark">PMAS</span>
          <span className="pmas-loader-brand-live">Live</span>
        </p>
        <p className="pmas-loader-message" key={resolvedMessage}>
          {resolvedMessage}
        </p>
        <div className="pmas-loader-bar" aria-hidden="true">
          {isFullscreen ? (
            <span className="pmas-loader-bar-progress" style={{ width: `${progress}%` }} />
          ) : (
            <span className="pmas-loader-bar-fill" />
          )}
        </div>
        {slow ? (
          <p className="pmas-loader-hint">{t("loader.slow")}</p>
        ) : null}
      </div>
    </div>
  );
}
