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
        loadingRef.current.add(plane.userId);
        loadPlaneModel().then((group) => {
          group.name = `remote-plane-${plane.userId}`;
          group.position.set(plane.x, plane.y, plane.z);
          _euler.set(-plane.pitch, Math.PI - plane.heading, plane.roll, "YXZ");
          group.setRotationFromEuler(_euler);
          layer.addGroup(group);
          planesRef.current.set(plane.userId, {
            group,
            prevX: plane.x, prevY: plane.y, prevZ: plane.z,
            prevHeading: plane.heading, prevPitch: plane.pitch, prevRoll: plane.roll,
            targetX: plane.x, targetY: plane.y, targetZ: plane.z,
            targetHeading: plane.heading, targetPitch: plane.pitch, targetRoll: plane.roll,
            updateTime: now,
            prevUpdateTime: now - 200,
            interval: 200,
          });
          loadingRef.current.delete(plane.userId);
        });
      }
    }

    usePlaneStore.getState().setRemotePlanes(remotePlanesMap);

    for (const [id, state] of planesRef.current) {
      if (!seenIds.has(id)) {
        layer.removeGroup(state.group);
        planesRef.current.delete(id);
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
