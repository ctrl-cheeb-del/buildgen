"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { useWorldStore } from "../stores/world-store";
import { loadProceduralGeometry } from "../viewer/procedural-loader";
import { applyBuildingTextures } from "../viewer/building-textures";
import { createLoadingPlaceholder } from "../viewer/loading-placeholder";
import {
  plotCenterMeters,
  gridIndexToColRow,
  type PlotState,
} from "../grid/grid-geometry";

export function useGridSync() {
  const { user } = useUser();
  const plots = useQuery(api.plots.getPlots);
  const buildings = useQuery(api.buildings.getAllBuildings);
  const initializePlots = useMutation(api.plots.initializePlots);
  const initialized = useRef(false);

  // Initialize plots on first load if empty or wrong count
  useEffect(() => {
    if (initialized.current) return;
    if (plots !== undefined) {
      initialized.current = true;
      if (plots.length === 0 || plots.length !== 80) {
        initializePlots();
      }
    }
  }, [plots, initializePlots]);

  // Sync buildings from Convex to Zustand/Three.js
  const { addBuilding, removeBuilding, replaceGeometry, updateTransform, layer } = useWorldStore();
  const syncedIds = useRef(new Set<string>());
  const syncedCodes = useRef(new Map<string, string>());
  const localPendingUpdates = useRef(new Map<string, number>());

  useEffect(() => {
    if (!buildings || !layer) return;

    const convexIds = new Set(buildings.map((b) => b._id as string));

    // Add new buildings or update existing ones
    for (const b of buildings) {
      const id = b._id as string;

      if (syncedIds.current.has(id)) {
        // Check if proceduralCode changed (iteration improvement)
        const prevCode = syncedCodes.current.get(id);
        if (prevCode !== undefined && prevCode !== b.proceduralCode) {
          console.log(`[GridSync] Code changed for ${id}, reloading geometry`);
          try {
            const newGroup = loadProceduralGeometry(b.proceduralCode);
            applyBuildingTextures(newGroup);
            replaceGeometry(id, newGroup);
            syncedCodes.current.set(id, b.proceduralCode);
          } catch (err) {
            console.error(`[GridSync] Failed to reload geometry for ${id}:`, err);
          }
        }

        // Check for transform updates from Convex (other users' changes)
        const pendingTs = localPendingUpdates.current.get(id);
        if (pendingTs && Date.now() - pendingTs < 500) {
          // Skip echo: this is our own update bouncing back
          continue;
        }

        // Apply persisted transform updates
        const offset: [number, number, number] = b.position
          ? [b.position.x, b.position.y, b.position.z]
          : [0, 0, 0];
        const rotation: [number, number, number] = b.rotation
          ? [b.rotation.x, b.rotation.y, b.rotation.z]
          : [0, 0, 0];
        const scale = b.scale ?? 1;

        updateTransform(id, { offset, rotation, scale });
        continue;
      }

      try {
        const { col, row } = gridIndexToColRow(b.plotIndex);
        const [mx, mz] = plotCenterMeters(col, row);

        const offset: [number, number, number] = b.position
          ? [b.position.x, b.position.y, b.position.z]
          : [0, 0, 0];
        const rotation: [number, number, number] = b.rotation
          ? [b.rotation.x, b.rotation.y, b.rotation.z]
          : [0, 0, 0];

        const group = loadProceduralGeometry(b.proceduralCode);
        // Apply textures async — group is already in scene, textures pop in when loaded
        applyBuildingTextures(group);

        addBuilding(
          {
            id,
            name: b.prompt,
            x: mx,
            z: mz,
            path: "A",
            scale: b.scale ?? 1,
            offset,
            rotation,
            visible: true,
            proceduralCode: b.proceduralCode,
          },
          group
        );
        syncedIds.current.add(id);
        syncedCodes.current.set(id, b.proceduralCode);
      } catch (err) {
        console.error(`[GridSync] Failed to load building ${id}:`, err);
      }
    }

    // Remove buildings no longer in Convex
    for (const id of syncedIds.current) {
      if (!convexIds.has(id)) {
        removeBuilding(id);
        syncedIds.current.delete(id);
        syncedCodes.current.delete(id);
      }
    }
  }, [buildings, layer, addBuilding, removeBuilding, updateTransform]);

  // ── Loading placeholders for "generating" plots ──────────────
  const placeholders = useRef(
    new Map<
      number,
      { group: THREE.Group; update: (t: number) => void; dispose: () => void }
    >()
  );

  useEffect(() => {
    if (!plots || !layer) return;

    const userId = user?.id;
    const generatingIndices = new Set(
      plots
        .filter((p) => p.status === "generating" && p.ownerId === userId)
        .map((p) => p.index)
    );

    // Candidate positions for auto-placement (must match convex/buildings.ts)
    const CANDIDATES: [number, number][] = [
      [0, 0],
      [-27, -27],
      [27, -27],
      [-27, 27],
      [27, 27],
    ];
    const MIN_SPACING = 30;

    // Add placeholders for newly generating plots
    for (const idx of generatingIndices) {
      if (placeholders.current.has(idx)) continue;

      const { col, row } = gridIndexToColRow(idx);
      const [mx, mz] = plotCenterMeters(col, row);

      // Predict free position by checking existing buildings on this plot
      const occupied = (buildings ?? [])
        .filter((b) => b.plotIndex === idx)
        .map((b) => ({
          x: b.position?.x ?? 0,
          z: b.position?.z ?? 0,
        }));

      let freeX = 0;
      let freeZ = 0;
      for (const [cx, cz] of CANDIDATES) {
        const overlaps = occupied.some(
          (o) => Math.abs(o.x - cx) < MIN_SPACING && Math.abs(o.z - cz) < MIN_SPACING
        );
        if (!overlaps) {
          freeX = cx;
          freeZ = cz;
          break;
        }
      }

      const placeholder = createLoadingPlaceholder();
      placeholder.group.position.x = mx + freeX;
      placeholder.group.position.z = mz + freeZ;
      layer.addGroup(placeholder.group);
      placeholders.current.set(idx, placeholder);
    }

    // Remove placeholders for plots that are no longer generating
    for (const [idx, ph] of placeholders.current) {
      if (!generatingIndices.has(idx)) {
        layer.removeGroup(ph.group);
        ph.dispose();
        placeholders.current.delete(idx);
      }
    }
  }, [plots, buildings, layer, user?.id]);

  // Animate active placeholders
  useEffect(() => {
    if (!layer) return;
    const map = placeholders.current;

    let animId = 0;
    const clock = new THREE.Clock();

    function tick() {
      animId = requestAnimationFrame(tick);
      if (map.size === 0) return;

      const elapsed = clock.getElapsedTime();
      for (const ph of map.values()) {
        ph.update(elapsed);
      }
      layer!.repaint();
    }
    tick();

    return () => cancelAnimationFrame(animId);
  }, [layer]);

  // Cleanup all placeholders on unmount
  useEffect(() => {
    const map = placeholders.current;
    return () => {
      for (const ph of map.values()) {
        ph.dispose();
      }
      map.clear();
    };
  }, []);

  // Generate plot states for GeoJSON
  const plotStates: PlotState[] = useMemo(() => {
    if (!plots) return [];
    return plots.map((p) => ({
      index: p.index,
      col: p.col,
      row: p.row,
      status: p.status,
      ownerId: p.ownerId ?? undefined,
      ownerName: p.ownerName ?? undefined,
      ownerUsername: p.ownerUsername ?? undefined,
      ownerAvatar: p.ownerAvatar ?? undefined,
      pipelineStep: p.pipelineStep ?? undefined,
      pipelineMultiViewUrl: p.pipelineMultiViewUrl ?? undefined,
    }));
  }, [plots]);

  return {
    plots,
    buildings,
    plotStates,
    localPendingUpdates: localPendingUpdates.current,
  };
}
