"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePlaneStore } from "../stores/plane-store";
import { useWorldStore } from "../stores/world-store";
import { loadPlaneModel } from "../plane/plane-loader";
import * as THREE from "three";

interface RemotePlaneState {
  group: THREE.Group;
  prevX: number;
  prevY: number;
  prevZ: number;
  prevHeading: number;
  prevPitch: number;
  prevRoll: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetHeading: number;
  targetPitch: number;
  targetRoll: number;
  updateTime: number;
  prevUpdateTime: number;
  interval: number;
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return from + diff * t;
}

const _euler = new THREE.Euler();

export function useRemotePlanes(userId: string | null) {
  const activePlanes = useQuery(api.planes.listActivePlanes);
  const planesRef = useRef<Map<string, RemotePlaneState>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!activePlanes) return;
    const layer = useWorldStore.getState().layer;
    if (!layer) return;

    const remotePlanesMap = new Map<
      string,
      {
        x: number; y: number; z: number;
        heading: number; pitch: number; roll: number;
        userId: string; userName: string; userAvatar?: string;
      }
    >();
    const seenIds = new Set<string>();
    const now = performance.now();

    for (const plane of activePlanes) {
      if (plane.userId === userId) continue;
      seenIds.add(plane.userId);
      remotePlanesMap.set(plane.userId, {
        x: plane.x, y: plane.y, z: plane.z,
        heading: plane.heading, pitch: plane.pitch, roll: plane.roll,
        userId: plane.userId,
        userName: plane.userName,
        userAvatar: plane.userAvatar,
      });

      const existing = planesRef.current.get(plane.userId);
      if (existing) {
        existing.prevX = existing.group.position.x;
        existing.prevY = existing.group.position.y;
        existing.prevZ = existing.group.position.z;
        existing.prevHeading = existing.targetHeading;
        existing.prevPitch = existing.targetPitch;
        existing.prevRoll = existing.targetRoll;
        existing.targetX = plane.x;
        existing.targetY = plane.y;
        existing.targetZ = plane.z;
        existing.targetHeading = plane.heading;
        existing.targetPitch = plane.pitch;
        existing.targetRoll = plane.roll;
        const timeSinceLast = now - existing.updateTime;
        if (timeSinceLast > 50 && timeSinceLast < 2000) {
          existing.interval = existing.interval * 0.5 + timeSinceLast * 0.5;
        }
        existing.prevUpdateTime = existing.updateTime;
        existing.updateTime = now;
      } else if (!loadingRef.current.has(plane.userId)) {
        const planeUserId = plane.userId;
        const px = plane.x, py = plane.y, pz = plane.z;
        const ph = plane.heading, pp = plane.pitch, pr = plane.roll;
        loadingRef.current.add(planeUserId);
        loadPlaneModel().then((group) => {
          // If this user left while model was loading, discard
          if (!loadingRef.current.has(planeUserId)) return;
          group.name = `remote-plane-${planeUserId}`;
          group.position.set(px, py, pz);
          _euler.set(-pp, Math.PI - ph, pr, "YXZ");
          group.setRotationFromEuler(_euler);
          layer.addGroup(group);
          planesRef.current.set(planeUserId, {
            group,
            prevX: px, prevY: py, prevZ: pz,
            prevHeading: ph, prevPitch: pp, prevRoll: pr,
            targetX: px, targetY: py, targetZ: pz,
            targetHeading: ph, targetPitch: pp, targetRoll: pr,
            updateTime: now,
            prevUpdateTime: now - 200,
            interval: 200,
          });
          loadingRef.current.delete(planeUserId);
        });
      }
    }

    usePlaneStore.getState().setRemotePlanes(remotePlanesMap);

    // Remove stale remote planes (no longer in active list)
    for (const [id, state] of planesRef.current) {
      if (!seenIds.has(id)) {
        layer.removeGroup(state.group);
        planesRef.current.delete(id);
      }
    }
    // Also clear loading entries for users who left
    for (const id of loadingRef.current) {
      if (!seenIds.has(id)) {
        loadingRef.current.delete(id);
      }
    }
  }, [activePlanes, userId]);

  // Animation loop — interpolate remote planes
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      let needsRepaint = false;

      for (const [, state] of planesRef.current) {
        const elapsed = now - state.updateTime;
        const t = Math.min(elapsed / state.interval, 1.2);
        const clamped = Math.min(t, 1);

        const x = state.prevX + (state.targetX - state.prevX) * t;
        const y = state.prevY + (state.targetY - state.prevY) * t;
        const z = state.prevZ + (state.targetZ - state.prevZ) * t;
        const heading = lerpAngle(state.prevHeading, state.targetHeading, clamped);
        const pitch = state.prevPitch + (state.targetPitch - state.prevPitch) * clamped;
        const roll = state.prevRoll + (state.targetRoll - state.prevRoll) * clamped;

        state.group.position.set(x, y, z);
        _euler.set(-pitch, Math.PI - heading, roll, "YXZ");
        state.group.setRotationFromEuler(_euler);
        needsRepaint = true;
      }

      if (needsRepaint) {
        useWorldStore.getState().layer?.repaint();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const layer = useWorldStore.getState().layer;
      for (const [, state] of planesRef.current) {
        layer?.removeGroup(state.group);
      }
      planesRef.current.clear();
    };
  }, []);
}
