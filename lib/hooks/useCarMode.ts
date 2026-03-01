"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useCarStore } from "../stores/car-store";
import { useBoatStore } from "../stores/boat-store";
import { usePlaneStore } from "../stores/plane-store";
import { useWorldStore } from "../stores/world-store";
import { useCarKeys } from "./useCarKeys";
import { loadCarModel } from "../car/car-loader";
import { updateCar, findNearestRoadPosition, type BuildingAABB } from "../car/car-physics";
import { createDriftEffects, type DriftEffects } from "../car/drift-effects";
import type { SceneLayer } from "../viewer/scene-layer";

function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ── GTA V-style chase camera state ──────────────────────────────
// All angles in radians. yawOffset = 0 means directly behind the car.
const cam = {
  yawOffset: 0,       // mouse orbit offset from car heading
  pitch: 0.35,        // vertical angle (0 = level, PI/2 = top-down)
  distance: 40,       // follow distance (zoom)
  dragging: false,
  lastPointerX: 0,
  lastPointerY: 0,
};

const CAM_PITCH_MIN = 0.05;
const CAM_PITCH_MAX = Math.PI / 2 - 0.05;
const CAM_DIST_MIN = 12;
const CAM_DIST_MAX = 120;
const CAM_SENSITIVITY = 0.004;
const CAM_RETURN_SPEED = 2.0;  // how fast yaw drifts back behind car (rad/s)
const CAM_HEIGHT_OFFSET = 3;   // look-at target height above ground

// Pre-allocated vectors
const _cameraTarget = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _box3 = new THREE.Box3();
const _size = new THREE.Vector3();

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
  const buildingAABBsRef = useRef<BuildingAABB[]>([]);
  const buildingCacheTimeRef = useRef<number>(0);

  // Store latest callback refs to avoid stale closures in animation loop
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const onSyncRef = useRef(onSyncPosition);
  onSyncRef.current = onSyncPosition;
  const onExitRef = useRef(onExitCar);
  onExitRef.current = onExitCar;

  // ── Mouse/touch event handlers for camera orbit + zoom ────────
  const onPointerDown = useCallback((e: PointerEvent) => {
    // Right-click or middle-click to orbit (left-click reserved for UI)
    if (e.button === 2 || e.button === 1) {
      cam.dragging = true;
      cam.lastPointerX = e.clientX;
      cam.lastPointerY = e.clientY;
      e.preventDefault();
    }
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!cam.dragging) return;
    const dx = e.clientX - cam.lastPointerX;
    const dy = e.clientY - cam.lastPointerY;
    cam.lastPointerX = e.clientX;
    cam.lastPointerY = e.clientY;

    cam.yawOffset -= dx * CAM_SENSITIVITY;
    cam.pitch = THREE.MathUtils.clamp(
      cam.pitch + dy * CAM_SENSITIVITY,
      CAM_PITCH_MIN,
      CAM_PITCH_MAX
    );
  }, []);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (e.button === 2 || e.button === 1) {
      cam.dragging = false;
    }
  }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    // Only intercept wheel when in car mode
    if (!useCarStore.getState().carMode) return;
    e.preventDefault();
    cam.distance = THREE.MathUtils.clamp(
      cam.distance + e.deltaY * 0.05,
      CAM_DIST_MIN,
      CAM_DIST_MAX
    );
  }, []);

  const onContextMenu = useCallback((e: MouseEvent) => {
    // Prevent context menu while in car mode (right-click = orbit)
    if (useCarStore.getState().carMode) {
      e.preventDefault();
    }
  }, []);

  const tick = useCallback((now: number) => {
    const carStore = useCarStore.getState();
    if (!carStore.carMode) return;

    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1); // clamp dt
    lastTimeRef.current = now;
    const nowSec = now / 1000;

    // Gather remote car positions for collision
    const remoteMap = carStore.remoteCars;
    const remoteCars = remoteMap
      ? Array.from(remoteMap.values(), (c) => ({ x: c.x, z: c.z }))
      : undefined;

    // Recompute building AABBs every 500ms
    if (now - buildingCacheTimeRef.current > 500) {
      buildingCacheTimeRef.current = now;
      const containers = useWorldStore.getState().containers;
      const aabbs: BuildingAABB[] = [];
      for (const container of containers.values()) {
        if (!container.visible) continue;
        _box3.setFromObject(container);
        _size.copy(_box3.max).sub(_box3.min);
        if (_size.x < 0.5 && _size.z < 0.5) continue;
        aabbs.push({
          minX: _box3.min.x, maxX: _box3.max.x,
          minY: _box3.min.y, maxY: _box3.max.y,
          minZ: _box3.min.z, maxZ: _box3.max.z,
        });
      }
      buildingAABBsRef.current = aabbs;
    }

    // Physics update
    const newState = updateCar(carStore.carPosition, keys.current!, dt, remoteCars, buildingAABBsRef.current);
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

    // ── GTA V chase camera ──────────────────────────────────────
    const currentLayer = layerRef.current;
    if (currentLayer) {
      const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;

      // When not dragging, drift yaw back to 0 (behind car)
      if (!cam.dragging && Math.abs(cam.yawOffset) > 0.001) {
        const returnStep = CAM_RETURN_SPEED * dt;
        if (Math.abs(cam.yawOffset) < returnStep) {
          cam.yawOffset = 0;
        } else {
          cam.yawOffset -= Math.sign(cam.yawOffset) * returnStep;
        }
      }

      // Camera orbit angle = car heading + user yaw offset
      const orbitAngle = newState.heading + cam.yawOffset;

      // Spherical coordinates: camera position relative to car
      const cosP = Math.cos(cam.pitch);
      const sinP = Math.sin(cam.pitch);
      _cameraPos.set(
        newState.x - Math.sin(orbitAngle) * cam.distance * cosP,
        cam.distance * sinP,
        newState.z + Math.cos(orbitAngle) * cam.distance * cosP
      );

      // Smooth follow — tighter at speed, looser when slow/orbiting
      const speed = Math.abs(newState.speed);
      const followLerp = cam.dragging
        ? 0.15  // responsive when user is orbiting
        : THREE.MathUtils.clamp(0.04 + speed * 0.003, 0.04, 0.12);
      camera.position.lerp(_cameraPos, followLerp);

      // Look at the car (slightly above ground)
      _cameraTarget.set(newState.x, CAM_HEIGHT_OFFSET, newState.z);
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

    // Exit other vehicle modes
    if (useBoatStore.getState().boatMode) {
      useBoatStore.getState().setBoatMode(false);
    }
    if (usePlaneStore.getState().planeMode) {
      usePlaneStore.getState().setPlaneMode(false);
    }

    const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;

    // Save current camera state
    savedCamera.current = {
      position: camera.position.clone(),
      target: new THREE.Vector3(0, 0, 0),
    };

    // Disable OrbitControls — car camera takes over
    currentLayer.setControlsEnabled(false);

    // Reset camera state
    cam.yawOffset = 0;
    cam.pitch = 0.35;
    cam.distance = 40;
    cam.dragging = false;

    // Add mouse/touch listeners for orbit + zoom
    const canvas = currentLayer.getCanvas();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

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
  }, [tick, onPointerDown, onPointerMove, onPointerUp, onWheel, onContextMenu]);

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

    // Remove mouse/touch listeners
    if (currentLayer) {
      const canvas = currentLayer.getCanvas();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    }

    useCarStore.getState().setCarGroup(null);
    useCarStore.getState().updatePosition({
      x: 0, z: 0, heading: 0, speed: 0, velAngle: 0, drifting: false,
    });

    // Restore camera position & re-enable OrbitControls
    if (currentLayer) {
      currentLayer.setControlsEnabled(true);
      if (savedCamera.current) {
        const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;
        camera.position.copy(savedCamera.current.position);
        camera.lookAt(0, 0, 0);
        currentLayer.repaint();
      }
    }

    onExitRef.current?.();
  }, [onPointerDown, onPointerMove, onPointerUp, onWheel, onContextMenu]);

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
