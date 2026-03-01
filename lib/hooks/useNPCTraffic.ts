"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useWorldStore } from "../stores/world-store";
import {
  NPCManager,
  setActiveNPCManager,
} from "../npc/npc-manager";

const SYNC_INTERVAL = 3000; // Write to Convex every 3 seconds

/**
 * React hook that creates NPC traffic (cars + pedestrians) from building data.
 * Reads buildings from Convex and spawns NPCs accordingly.
 * Periodically syncs NPC car positions to Convex for cross-client visibility.
 */
export function useNPCTraffic(): void {
  const buildings = useQuery(api.buildings.getAllBuildings);
  const layer = useWorldStore((s) => s.layer);
  const managerRef = useRef<NPCManager | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateSnapshot = useMutation(api.npcTraffic.updateSnapshot);

  const syncToConvex = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const snapshots = manager.getCarSnapshots();
    if (snapshots.length === 0) return;
    updateSnapshot({ cars: snapshots }).catch(() => {
      // Silently ignore — non-critical sync
    });
  }, [updateSnapshot]);

  // Create/destroy manager with scene layer
  useEffect(() => {
    if (!layer) return;

    const manager = new NPCManager();
    managerRef.current = manager;
    setActiveNPCManager(manager);
    layer.addGroup(manager.group);

    // Start periodic sync
    syncTimerRef.current = setInterval(syncToConvex, SYNC_INTERVAL);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
      setActiveNPCManager(null);
      layer.removeGroup(manager.group);
      manager.dispose();
      managerRef.current = null;
    };
  }, [layer, syncToConvex]);

  // Rebuild NPCs when buildings change
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !buildings) return;

    manager.rebuild(
      buildings.map((b) => ({
        plotIndex: b.plotIndex,
        prompt: b.prompt,
        category: b.category ?? null,
      }))
    );
  }, [buildings]);
}
