"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

export type ScrollOnDependencyOptions = {
  /** When false, never scrolls. Default true. */
  enabled?: boolean;
  /** Skip the first effect so deep-links / initial state do not jump. Default true. */
  skipInitial?: boolean;
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
};

function isActiveKey(key: string | number | null | undefined | boolean): boolean {
  if (key == null || key === false) return false;
  if (typeof key === "string" && key.trim() === "") return false;
  return true;
}

/**
 * Returns a ref to attach to the dependent panel. When `key` changes to an
 * active value (non-empty), that panel is scrolled into view.
 */
export function useScrollOnDependency<T extends HTMLElement = HTMLDivElement>(
  key: string | number | null | undefined | boolean,
  options?: ScrollOnDependencyOptions,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const lastScrolledKeyRef = useRef<string | number | boolean | null>(null);
  const readyRef = useRef(false);
  const enabled = options?.enabled !== false;
  const skipInitial = options?.skipInitial !== false;
  const behavior = options?.behavior ?? "auto";
  const block = options?.block ?? "start";
  const inline = options?.inline ?? "nearest";

  useLayoutEffect(() => {
    if (!enabled) return;

    // First effect only: remember current key, never scroll (deep-link / hydrate).
    // Must run even when key is empty so the user's first click is not treated as "initial".
    if (skipInitial && !readyRef.current) {
      readyRef.current = true;
      lastScrolledKeyRef.current = isActiveKey(key) ? (key as string | number | boolean) : null;
      return;
    }
    readyRef.current = true;

    if (!isActiveKey(key)) {
      // Allow the same id to scroll again after clear → reselect.
      lastScrolledKeyRef.current = null;
      return;
    }

    if (lastScrolledKeyRef.current === key) return;
    lastScrolledKeyRef.current = key as string | number | boolean;

    const run = () => {
      const el = ref.current;
      if (!el) return false;
      el.scrollIntoView({ behavior, block, inline });
      return true;
    };

    if (run()) return;

    const frame = requestAnimationFrame(() => {
      if (!run()) requestAnimationFrame(() => run());
    });
    return () => cancelAnimationFrame(frame);
  }, [key, enabled, skipInitial, behavior, block, inline]);

  return ref;
}
