"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCarStore } from "../stores/car-store";
import { useWorldStore } from "../stores/world-store";
import { loadCarModel } from "../car/car-loader";
import * as THREE from "three";

export function useRemoteCars(userId: string | null) {
  const activeCars = useQuery(api.cars.listActiveCars);
  const remoteGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeCars) return;
    const layer = useWorldStore.getState().layer;
    if (!layer) return;

    const remoteCarsMap = new Map<
      string,
      { x: number; z: number; heading: number; userId: string; userName: string }
    >();

    const seenIds = new Set<string>();

    for (const car of activeCars) {
      if (car.userId === userId) continue;
      seenIds.add(car.userId);
      remoteCarsMap.set(car.userId, {
        x: car.x,
        z: car.z,
        heading: car.heading,
        userId: car.userId,
        userName: car.userName,
      });

      // Create or update remote car group
      const existing = remoteGroupsRef.current.get(car.userId);
      if (existing) {
        // Smooth interpolation toward target
        existing.position.lerp(
          new THREE.Vector3(car.x, 0, car.z),
          0.3
        );
        existing.rotation.y = car.heading;
      } else if (!loadingRef.current.has(car.userId)) {
        // Load and add new remote car (guard against duplicate loads)
        loadingRef.current.add(car.userId);
        loadCarModel().then((group) => {
          group.name = `remote-car-${car.userId}`;
          group.position.set(car.x, 0, car.z);
          group.rotation.set(0, car.heading, 0);
          layer.addGroup(group);
          remoteGroupsRef.current.set(car.userId, group);
          loadingRef.current.delete(car.userId);
        });
      }
    }

    layer.repaint();
    useCarStore.getState().setRemoteCars(remoteCarsMap);

    // Remove stale remote cars
    for (const [id, group] of remoteGroupsRef.current) {
      if (!seenIds.has(id)) {
        layer.removeGroup(group);
        remoteGroupsRef.current.delete(id);
        loadingRef.current.delete(id);
      }
    }
  }, [activeCars, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const layer = useWorldStore.getState().layer;
      for (const [, group] of remoteGroupsRef.current) {
        layer?.removeGroup(group);
      }
      remoteGroupsRef.current.clear();
    };
  }, []);
}
