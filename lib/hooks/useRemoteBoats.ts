"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useBoatStore } from "../stores/boat-store";
import { useWorldStore } from "../stores/world-store";
import { loadBoatModel } from "../boat/boat-loader";
import * as THREE from "three";

interface RemoteBoatState {
  group: THREE.Group;
  prevX: number;
  prevZ: number;
  prevHeading: number;
  targetX: number;
  targetZ: number;
  targetHeading: number;
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

const BOAT_Y = -4.5;

export function useRemoteBoats(userId: string | null) {
  const activeBoats = useQuery(api.boats.listActiveBoats);
  const boatsRef = useRef<Map<string, RemoteBoatState>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!activeBoats) return;
    const layer = useWorldStore.getState().layer;
    if (!layer) return;

    const remoteBoatsMap = new Map<
      string,
      { x: number; z: number; heading: number; userId: string; userName: string; userAvatar?: string }
    >();
    const seenIds = new Set<string>();
    const now = performance.now();

    for (const boat of activeBoats) {
      if (boat.userId === userId) continue;
      seenIds.add(boat.userId);
      remoteBoatsMap.set(boat.userId, {
        x: boat.x,
        z: boat.z,
        heading: boat.heading,
        userId: boat.userId,
        userName: boat.userName,
        userAvatar: boat.userAvatar,
      });

      const existing = boatsRef.current.get(boat.userId);
      if (existing) {
        existing.prevX = existing.group.position.x;
        existing.prevZ = existing.group.position.z;
        existing.prevHeading = existing.group.rotation.y;
        existing.targetX = boat.x;
        existing.targetZ = boat.z;
        existing.targetHeading = Math.PI - boat.heading;
        const timeSinceLast = now - existing.updateTime;
        if (timeSinceLast > 50 && timeSinceLast < 2000) {
          existing.interval = existing.interval * 0.5 + timeSinceLast * 0.5;
        }
        existing.prevUpdateTime = existing.updateTime;
        existing.updateTime = now;
      } else if (!loadingRef.current.has(boat.userId)) {
        const boatUserId = boat.userId;
        const bx = boat.x, bz = boat.z, bh = boat.heading;
        loadingRef.current.add(boatUserId);
        loadBoatModel().then((group) => {
          // If this user left while model was loading, discard
          if (!loadingRef.current.has(boatUserId)) return;
          group.name = `remote-boat-${boatUserId}`;
          group.position.set(bx, BOAT_Y, bz);
          group.rotation.set(0, Math.PI - bh, 0);
          layer.addGroup(group);
          boatsRef.current.set(boatUserId, {
            group,
            prevX: bx,
            prevZ: bz,
            prevHeading: Math.PI - bh,
            targetX: bx,
            targetZ: bz,
            targetHeading: Math.PI - bh,
            updateTime: now,
            prevUpdateTime: now - 200,
            interval: 200,
          });
          loadingRef.current.delete(boatUserId);
        });
      }
    }

    useBoatStore.getState().setRemoteBoats(remoteBoatsMap);

    // Remove stale remote boats (no longer in active list)
    for (const [id, state] of boatsRef.current) {
      if (!seenIds.has(id)) {
        layer.removeGroup(state.group);
        boatsRef.current.delete(id);
      }
    }
    // Also clear loading entries for users who left
    for (const id of loadingRef.current) {
      if (!seenIds.has(id)) {
        loadingRef.current.delete(id);
      }
    }
  }, [activeBoats, userId]);

  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      let needsRepaint = false;

      for (const [, state] of boatsRef.current) {
        const elapsed = now - state.updateTime;
        const t = Math.min(elapsed / state.interval, 1.2);
        const clamped = Math.min(t, 1);

        const x = state.prevX + (state.targetX - state.prevX) * t;
        const z = state.prevZ + (state.targetZ - state.prevZ) * t;
        const heading = lerpAngle(state.prevHeading, state.targetHeading, clamped);

        // Bob effect for remote boats too
        const bob = Math.sin(now / 1000 * 1.5) * 0.3;
        state.group.position.x = x;
        state.group.position.y = BOAT_Y + bob;
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

  useEffect(() => {
    return () => {
      const layer = useWorldStore.getState().layer;
      for (const [, state] of boatsRef.current) {
        layer?.removeGroup(state.group);
      }
      boatsRef.current.clear();
    };
  }, []);
}
