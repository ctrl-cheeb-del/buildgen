"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useCarStore } from "@/lib/stores/car-store";
import { useBoatStore } from "@/lib/stores/boat-store";
import { usePlaneStore } from "@/lib/stores/plane-store";
import { useWorldStore } from "@/lib/stores/world-store";
import { getActiveNPCManager } from "@/lib/npc/npc-manager";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface VehicleTag {
  key: string;
  x: number;
  y: number;
  z: number;
  /** Display name — player username or NPC agent name */
  name: string;
  /** Whether this is an NPC-driven vehicle (vs player) */
  isNpc: boolean;
  /** Agent's home plot index (NPC only) */
  plotIndex?: number;
  /** Activity description (NPC only) */
  activity?: string;
}

/**
 * Renders always-visible floating name tags above remote cars, boats, and planes.
 * Supports both player vehicles (shows username) and NPC vehicles (shows agent name).
 * Projects 3D vehicle positions to screen coordinates each frame.
 */
export default function VehicleNameTags({
  onNPCClick,
}: {
  onNPCClick?: (plotIndex: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tagsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef = useRef<number>(0);

  const onNPCClickRef = useRef(onNPCClick);
  onNPCClickRef.current = onNPCClick;

  const updateTags = useCallback(() => {
    const layer = useWorldStore.getState().layer;
    if (!layer || !containerRef.current) {
      rafRef.current = requestAnimationFrame(updateTags);
      return;
    }

    const camera = layer.getCamera() as THREE.PerspectiveCamera;
    const canvas = layer.getCanvas();
    const rect = canvas.getBoundingClientRect();

    const vehicles: VehicleTag[] = [];

    // Player remote cars
    const remoteCars = useCarStore.getState().remoteCars;
    for (const [id, car] of remoteCars) {
      vehicles.push({
        key: `car-${id}`,
        x: car.x, y: 3, z: car.z,
        name: car.userName,
        isNpc: false,
      });
    }

    // Player remote boats
    const remoteBoats = useBoatStore.getState().remoteBoats;
    for (const [id, boat] of remoteBoats) {
      vehicles.push({
        key: `boat-${id}`,
        x: boat.x, y: 1, z: boat.z,
        name: boat.userName,
        isNpc: false,
      });
    }

    // Player remote planes
    const remotePlanes = usePlaneStore.getState().remotePlanes;
    for (const [id, plane] of remotePlanes) {
      vehicles.push({
        key: `plane-${id}`,
        x: plane.x, y: plane.y + 5, z: plane.z,
        name: plane.userName,
        isNpc: false,
      });
    }

    // NPC vehicles — cars and pedestrians from NPC manager
    const npcManager = getActiveNPCManager();
    if (npcManager && camera) {
      const npcs = npcManager.getVisibleNPCs(camera.position.x, camera.position.z, 300);
      for (const npc of npcs) {
        vehicles.push({
          key: npc.key,
          x: npc.x,
          y: npc.y,
          z: npc.z,
          name: npc.name,
          isNpc: true,
          plotIndex: npc.plotIndex,
          activity: npc.activity,
        });
      }
    }

    const activeKeys = new Set<string>();

    for (const v of vehicles) {
      activeKeys.add(v.key);

      // Project to screen
      const pos = new THREE.Vector3(v.x, v.y, v.z);
      pos.project(camera);
      if (pos.z > 1) {
        const existing = tagsRef.current.get(v.key);
        if (existing) existing.style.display = "none";
        continue;
      }

      const screenX = ((pos.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-pos.y + 1) / 2) * rect.height + rect.top;

      let tag = tagsRef.current.get(v.key);
      if (!tag) {
        tag = document.createElement("div");
        tag.style.cssText = `
          position: fixed; z-index: 48;
          transform: translate(-50%, -100%);
          border-radius: 4px; padding: 2px 6px;
          font-family: system-ui; white-space: nowrap;
          font-size: 11px; font-weight: 600; color: white;
        `;
        if (v.isNpc) {
          tag.style.pointerEvents = "auto";
          tag.style.cursor = "pointer";
          const plotIdx = v.plotIndex;
          tag.addEventListener("click", () => {
            if (plotIdx !== undefined) onNPCClickRef.current?.(plotIdx);
          });
        } else {
          tag.style.pointerEvents = "none";
        }
        containerRef.current!.appendChild(tag);
        tagsRef.current.set(v.key, tag);
      }

      // NPC tags get a distinct color so you can tell them apart from players
      tag.style.background = v.isNpc ? "rgba(99,102,241,0.8)" : "rgba(0,0,0,0.7)";
      tag.style.display = "";
      tag.style.left = `${screenX}px`;
      tag.style.top = `${screenY}px`;
      tag.innerHTML = v.isNpc && v.activity
        ? `${esc(v.name)}<br><span style="font-size:9px;font-weight:400;opacity:0.8">${esc(v.activity)}</span>`
        : esc(v.name);
    }

    // Remove stale tags
    for (const [key, tag] of tagsRef.current) {
      if (!activeKeys.has(key)) {
        tag.remove();
        tagsRef.current.delete(key);
      }
    }

    rafRef.current = requestAnimationFrame(updateTags);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updateTags);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const [, tag] of tagsRef.current) {
        tag.remove();
      }
      tagsRef.current.clear();
    };
  }, [updateTags]);

  return <div ref={containerRef} />;
}
