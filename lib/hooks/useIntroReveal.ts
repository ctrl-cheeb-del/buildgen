"use client";

import { useEffect, useRef } from "react";
import { useIntroStore } from "../stores/intro-store";
import { useWorldStore } from "../stores/world-store";

export function useIntroReveal() {
  const phase = useIntroStore((s) => s.phase);
  const initialBuildingIds = useIntroStore((s) => s.initialBuildingIds);
  const setPhase = useIntroStore((s) => s.setPhase);
  const revealBuilding = useWorldStore((s) => s.revealBuilding);
  const started = useRef(false);

  useEffect(() => {
    if (phase !== "revealing" || started.current) return;
    started.current = true;

    if (initialBuildingIds.length === 0) {
      setPhase("done");
      return;
    }

    // Sort by distance from city center (0,0) using container positions
    const containers = useWorldStore.getState().containers;
    const sorted = [...initialBuildingIds].sort((a, b) => {
      const ca = containers.get(a);
      const cb = containers.get(b);
      const da = ca
        ? ca.position.x * ca.position.x + ca.position.z * ca.position.z
        : 0;
      const db = cb
        ? cb.position.x * cb.position.x + cb.position.z * cb.position.z
        : 0;
      return da - db;
    });

    // Cap total reveal to ~5s max regardless of building count
    const ANIM_DURATION_MS = 150;
    const maxStaggerTotal = 5000 - ANIM_DURATION_MS;
    const STAGGER_MS = Math.min(30, maxStaggerTotal / Math.max(sorted.length - 1, 1));

    sorted.forEach((id, i) => {
      setTimeout(() => revealBuilding(id), i * STAGGER_MS);
    });

    // Done after last animation completes
    const totalMs =
      (sorted.length - 1) * STAGGER_MS + ANIM_DURATION_MS;
    setTimeout(() => setPhase("done"), totalMs);
  }, [phase, initialBuildingIds, setPhase, revealBuilding]);
}
