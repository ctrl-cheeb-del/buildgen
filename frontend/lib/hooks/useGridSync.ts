"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useWorldStore } from "../stores/world-store";
import { loadProceduralGeometry } from "../viewer/procedural-loader";
import {
  generateGridGeoJSON,
  getPlotCenter,
  gridIndexToColRow,
  type PlotState,
} from "../grid/grid-geometry";

export function useGridSync() {
  const plots = useQuery(api.plots.getPlots);
  const buildings = useQuery(api.buildings.getAllBuildings);
  const initializePlots = useMutation(api.plots.initializePlots);
  const initialized = useRef(false);

  // Initialize plots on first load if empty
  useEffect(() => {
    if (initialized.current) return;
    if (plots !== undefined && plots.length === 0) {
      initialized.current = true;
      initializePlots();
    } else if (plots !== undefined && plots.length > 0) {
      initialized.current = true;
    }
  }, [plots, initializePlots]);

  // Sync buildings from Convex to Zustand/Three.js
  const { addBuilding, removeBuilding, layer } = useWorldStore();
  const syncedIds = useRef(new Set<string>());

  useEffect(() => {
    if (!buildings || !layer) return;

    const convexIds = new Set(buildings.map((b) => b._id as string));

    // Add new buildings
    for (const b of buildings) {
      const id = b._id as string;
      if (syncedIds.current.has(id)) continue;

      try {
        const { col, row } = gridIndexToColRow(b.plotIndex);
        const [lng, lat] = getPlotCenter(col, row);
        const group = loadProceduralGeometry(b.proceduralCode);

        addBuilding(
          {
            id,
            name: b.prompt,
            lng,
            lat,
            path: "A",
            scale: 1,
            offset: [0, 0, 0],
            rotation: [0, 0, 0],
            visible: true,
            proceduralCode: b.proceduralCode,
          },
          group
        );
        syncedIds.current.add(id);
      } catch (err) {
        console.error(`[GridSync] Failed to load building ${id}:`, err);
      }
    }

    // Remove buildings no longer in Convex
    for (const id of syncedIds.current) {
      if (!convexIds.has(id)) {
        removeBuilding(id);
        syncedIds.current.delete(id);
      }
    }
  }, [buildings, layer, addBuilding, removeBuilding]);

  // Generate plot states for GeoJSON
  const plotStates: PlotState[] = useMemo(() => {
    if (!plots) return [];
    return plots.map((p) => ({
      index: p.index,
      col: p.col,
      row: p.row,
      status: p.status,
      buildingId: p.buildingId ?? undefined,
    }));
  }, [plots]);

  const gridGeoJSON = useMemo(() => {
    return generateGridGeoJSON(plotStates);
  }, [plotStates]);

  return { plots, buildings, plotStates, gridGeoJSON };
}
