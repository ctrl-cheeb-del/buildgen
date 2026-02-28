"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useCarStore } from "../stores/car-store";
import { useCarKeys } from "./useCarKeys";
import { loadCarModel } from "../car/car-loader";
import { updateCar, findNearestRoadPosition } from "../car/car-physics";
import { createDriftEffects, type DriftEffects } from "../car/drift-effects";
import type { SceneLayer } from "../viewer/scene-layer";

function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Pre-allocated vector for camera follow
const _cameraTarget = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();

export function useCarMode(
  layer: SceneLayer | null,
  onSyncPosition?: (x: number, z: number, heading: number) => void,
  onExitCar?: () => void
) {
  const keys = useCarKeys();
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const syncTimerRef = useRef<number>(0);
  const prevCarMode = useRef(false);
  const driftEffectsRef = useRef<DriftEffects | null>(null);
  const savedCamera = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

  // Store latest callback refs to avoid stale closures in animation loop
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const onSyncRef = useRef(onSyncPosition);
  onSyncRef.current = onSyncPosition;
  const onExitRef = useRef(onExitCar);
  onExitRef.current = onExitCar;

  const tick = useCallback((now: number) => {
    const carStore = useCarStore.getState();
    if (!carStore.carMode) return;

    const dt = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;
    const nowSec = now / 1000;

    // Gather remote car positions for collision
    const remoteMap = carStore.remoteCars;
    const remoteCars = remoteMap
      ? Array.from(remoteMap.values(), (c) => ({ x: c.x, z: c.z }))
      : undefined;

    // Physics update
    const newState = updateCar(carStore.carPosition, keys.current!, dt, remoteCars);
    carStore.updatePosition(newState);

    // Update Three.js car group
    const carGroup = carStore.carGroup;
    if (carGroup) {
      carGroup.position.set(newState.x, 0, newState.z);
      carGroup.rotation.set(0, Math.PI - newState.heading, 0);
    }

    // Update drift effects (tire marks + smoke)
    const driftAngle = wrapAngle(newState.heading - newState.velAngle);
    driftEffectsRef.current?.update(
      newState.x,
      newState.z,
      newState.heading,
      newState.drifting,
      driftAngle,
      Math.abs(newState.speed),
      dt,
      nowSec
    );

    // Camera follow — direct Three.js camera manipulation
    const currentLayer = layerRef.current;
    if (currentLayer) {
      const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;
      const bearingRad = newState.heading;

      // Position camera behind and above the car
      const followDist = 35;
      const followHeight = 18;
      _cameraPos.set(
        newState.x + Math.sin(bearingRad) * followDist,
        followHeight,
        newState.z - Math.cos(bearingRad) * followDist
      );

      // Speed-adaptive follow: tighter at high speed, looser when slow
      const speed = Math.abs(newState.speed);
      const followLerp = THREE.MathUtils.clamp(0.04 + speed * 0.003, 0.04, 0.15);
      camera.position.lerp(_cameraPos, followLerp);

      // Look slightly ahead of the car (forward-biased target)
      const lookAhead = Math.min(speed * 0.3, 10);
      _cameraTarget.set(
        newState.x - Math.sin(bearingRad) * lookAhead,
        2,
        newState.z + Math.cos(bearingRad) * lookAhead
      );
      camera.lookAt(_cameraTarget);

      currentLayer.repaint();
    }

    // Debounced multiplayer sync (every 200ms)
    if (onSyncRef.current && now - syncTimerRef.current > 200) {
      syncTimerRef.current = now;
      onSyncRef.current(newState.x, newState.z, newState.heading);
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [keys]);

  const enterCarMode = useCallback(async () => {
    const currentLayer = layerRef.current;
    if (!currentLayer) return;

    const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;

    // Save current camera state
    savedCamera.current = {
      position: camera.position.clone(),
      target: new THREE.Vector3(0, 0, 0), // will be restored
    };

    // Load car model
    const carGroup = await loadCarModel();
    carGroup.name = "player-car";
    currentLayer.addGroup(carGroup);
    useCarStore.getState().setCarGroup(carGroup);

    // Create drift effects and add to scene
    const effects = createDriftEffects();
    driftEffectsRef.current = effects;
    currentLayer.addGroup(effects.group);

    // Place car on nearest road from camera target (roughly center of view)
    const roadPos = findNearestRoadPosition(0, 0);
    useCarStore.getState().updatePosition({
      x: roadPos.x,
      z: roadPos.z,
      heading: 0,
      speed: 0,
      velAngle: 0,
      drifting: false,
    });

    // Position car in scene
    carGroup.position.set(roadPos.x, 0, roadPos.z);
    carGroup.rotation.set(0, Math.PI, 0);
    currentLayer.repaint();

    // Start animation loop
    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const exitCarMode = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    const carGroup = useCarStore.getState().carGroup;
    const currentLayer = layerRef.current;
    if (carGroup && currentLayer) {
      currentLayer.removeGroup(carGroup);
    }

    // Clean up drift effects
    if (driftEffectsRef.current && currentLayer) {
      currentLayer.removeGroup(driftEffectsRef.current.group);
      driftEffectsRef.current.dispose();
      driftEffectsRef.current = null;
    }

    useCarStore.getState().setCarGroup(null);
    useCarStore.getState().updatePosition({
      x: 0, z: 0, heading: 0, speed: 0, velAngle: 0, drifting: false,
    });

    // Restore camera position
    if (savedCamera.current && currentLayer) {
      const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;
      camera.position.copy(savedCamera.current.position);
      camera.lookAt(0, 0, 0);
      currentLayer.repaint();
    }

    onExitRef.current?.();
  }, []);

  // React to carMode changes
  useEffect(() => {
    const unsub = useCarStore.subscribe((state) => {
      if (state.carMode && !prevCarMode.current) {
        prevCarMode.current = true;
        enterCarMode();
      } else if (!state.carMode && prevCarMode.current) {
        prevCarMode.current = false;
        exitCarMode();
      }
    });
    return () => {
      unsub();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enterCarMode, exitCarMode]);
}
