"use client";

interface PmasLoaderProps {
  message?: string;
  /** Compact inline variant for overlays; full-screen by default */
  variant?: "fullscreen" | "inline";
}

export function PmasLoader({
  message = "Loading PMAS Live…",
  variant = "fullscreen",
}: PmasLoaderProps) {
  return (
    <div
      className={`pmas-loader${variant === "inline" ? " pmas-loader-inline" : ""}`}
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
      </div>

      <div className="pmas-loader-copy">
        <p className="pmas-loader-brand">
          <span className="pmas-loader-brand-mark">PMAS</span>
          <span className="pmas-loader-brand-live">Live</span>
        </p>
        <p className="pmas-loader-message">{message}</p>
        <div className="pmas-loader-bar" aria-hidden="true">
          <span className="pmas-loader-bar-fill" />
        </div>
      </div>
    </div>
  );
}
