"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCarStore } from "../stores/car-store";
import { useWorldStore } from "../stores/world-store";
import { loadCarModel } from "../car/car-loader";
import * as THREE from "three";

/** Per-remote-car interpolation state */
interface RemoteCarState {
  group: THREE.Group;
  // Previous position (where interpolation starts from)
  prevX: number;
  prevZ: number;
  prevHeading: number;
  // Target position (where we're interpolating toward)
  targetX: number;
  targetZ: number;
  targetHeading: number;
  // Timing
  updateTime: number; // when we received the latest target
  prevUpdateTime: number; // when we received the previous target (to estimate interval)
  interval: number; // estimated ms between server updates
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return from + diff * t;
}

export function useRemoteCars(userId: string | null) {
  const activeCars = useQuery(api.cars.listActiveCars);
  const carsRef = useRef<Map<string, RemoteCarState>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);

  // Handle Convex data updates — set targets, don't move groups directly
  useEffect(() => {
    if (!activeCars) return;
    const layer = useWorldStore.getState().layer;
    if (!layer) return;

    const remoteCarsMap = new Map<
      string,
      { x: number; z: number; heading: number; userId: string; userName: string; userAvatar?: string }
    >();
    const seenIds = new Set<string>();
    const now = performance.now();

    for (const car of activeCars) {
      if (car.userId === userId) continue;
      seenIds.add(car.userId);
      remoteCarsMap.set(car.userId, {
        x: car.x,
        z: car.z,
        heading: car.heading,
        userId: car.userId,
        userName: car.userName,
        userAvatar: car.userAvatar,
      });

      const existing = carsRef.current.get(car.userId);
      if (existing) {
        // Snap prev to current interpolated position (where the group is right now)
        existing.prevX = existing.group.position.x;
        existing.prevZ = existing.group.position.z;
        existing.prevHeading = existing.group.rotation.y;
        // Set new target
        existing.targetX = car.x;
        existing.targetZ = car.z;
        existing.targetHeading = Math.PI - car.heading;
        // Update timing
        const timeSinceLast = now - existing.updateTime;
        if (timeSinceLast > 50 && timeSinceLast < 2000) {
          // Smooth the interval estimate to avoid jitter
          existing.interval = existing.interval * 0.5 + timeSinceLast * 0.5;
        }
        existing.prevUpdateTime = existing.updateTime;
        existing.updateTime = now;
      } else if (!loadingRef.current.has(car.userId)) {
        const carUserId = car.userId;
        const cx = car.x, cz = car.z, ch = car.heading;
        loadingRef.current.add(carUserId);
        loadCarModel().then((group) => {
          // If this user left while model was loading, discard
          if (!loadingRef.current.has(carUserId)) return;
          group.name = `remote-car-${carUserId}`;
          group.position.set(cx, 0, cz);
          group.rotation.set(0, Math.PI - ch, 0);
          layer.addGroup(group);
          carsRef.current.set(carUserId, {
            group,
            prevX: cx,
            prevZ: cz,
            prevHeading: Math.PI - ch,
            targetX: cx,
            targetZ: cz,
            targetHeading: Math.PI - ch,
            updateTime: now,
            prevUpdateTime: now - 200,
            interval: 200,
          });
          loadingRef.current.delete(carUserId);
        });
      }
    }

    useCarStore.getState().setRemoteCars(remoteCarsMap);

    // Remove stale remote cars (no longer in active list)
    for (const [id, state] of carsRef.current) {
      if (!seenIds.has(id)) {
        layer.removeGroup(state.group);
        carsRef.current.delete(id);
      }
    }
    // Also clear loading entries for users who left
    for (const id of loadingRef.current) {
      if (!seenIds.has(id)) {
        loadingRef.current.delete(id);
      }
    }
  }, [activeCars, userId]);

  // Animation loop — smoothly interpolate all remote cars every frame
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      let needsRepaint = false;

      for (const [, state] of carsRef.current) {
        // t goes from 0 (at updateTime) to 1 (at updateTime + interval)
        const elapsed = now - state.updateTime;
        // Allow slight overshoot (1.2) for extrapolation to keep motion smooth
        // if the next update is slightly late
        const t = Math.min(elapsed / state.interval, 1.2);
        const clamped = Math.min(t, 1);

        const x = state.prevX + (state.targetX - state.prevX) * t;
        const z = state.prevZ + (state.targetZ - state.prevZ) * t;
        const heading = lerpAngle(state.prevHeading, state.targetHeading, clamped);

        state.group.position.x = x;
        state.group.position.z = z;
        state.group.rotation.y = heading;
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
      for (const [, state] of carsRef.current) {
        layer?.removeGroup(state.group);
      }
      carsRef.current.clear();
    };
  }, []);
}
