"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/core/auth/auth-store";
import { firstAllowedPath } from "@/shared/routes";

const GLYPHS = "01<>{}[]/\\#$%&@*";

function ScrambleDigit({ value, delay }: { value: string; delay: number }) {
  const [glyph, setGlyph] = useState(value);

  useEffect(() => {
    let frame = 0;
    const start = window.setTimeout(() => {
      const timer = window.setInterval(() => {
        frame += 1;
        if (frame > 12) {
          setGlyph(value);
          window.clearInterval(timer);
          return;
        }
        setGlyph(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      }, 55);
    }, delay);
    return () => window.clearTimeout(start);
  }, [value, delay]);

  return <span className="nf-digit">{glyph}</span>;
}

export default function NotFound() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Session lives in browser storage, so resolve the target only after hydration.
  const homeHref =
    mounted && user
      ? firstAllowedPath(user.role, user.permissions, Boolean(user.tenant_id))
      : "/welcome";

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = surfaceRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--nf-tilt-x", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--nf-tilt-y", `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty("--nf-spot-x", `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--nf-spot-y", `${((y + 0.5) * 100).toFixed(1)}%`);
  }, []);

  const resetTilt = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    el.style.setProperty("--nf-tilt-x", "0deg");
    el.style.setProperty("--nf-tilt-y", "0deg");
  }, []);

  return (
    <main
      className="nf-page"
      ref={surfaceRef}
      onPointerMove={onPointerMove}
      onPointerLeave={resetTilt}
    >
      <div className="nf-grid" aria-hidden />
      <div className="nf-aurora" aria-hidden />
      <div className="nf-spotlight" aria-hidden />
      <div className="nf-orbits" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <section className="nf-card">
        <p className="nf-kicker">
          <span className="nf-dot" aria-hidden />
          Signal lost · Route not found
        </p>

        <h1 className="nf-code" aria-label="404">
          <ScrambleDigit value="4" delay={80} />
          <span className="nf-zero" aria-hidden>
            <span className="nf-zero-ring" />
            <span className="nf-zero-core" />
          </span>
          <ScrambleDigit value="4" delay={320} />
        </h1>

        <h2 className="nf-title">This route drifted off the pipeline</h2>
        <p className="nf-sub">
          The page you requested does not exist, was archived, or you may not have access to it.
          Everything else in your workspace is still running normally.
        </p>

        <div className="nf-actions">
          <Link href={homeHref} className="btn btn-primary nf-primary">
            Back to workspace
          </Link>
          <button type="button" className="btn nf-ghost" onClick={() => router.back()}>
            Go back
          </button>
        </div>

        <ul className="nf-hints">
          <li>
            <span>Check the address</span>
            <p>A stale bookmark or a copied link with an outdated ID.</p>
          </li>
          <li>
            <span>Permission scoped</span>
            <p>Some sections only appear for roles that own them.</p>
          </li>
          <li>
            <span>Item archived</span>
            <p>Soft-deleted records disappear from their old URLs.</p>
          </li>
        </ul>
      </section>
    </main>
  );
}
