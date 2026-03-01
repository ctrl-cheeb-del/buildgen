"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { usePlaneStore } from "../stores/plane-store";
import { useCarStore } from "../stores/car-store";
import { useBoatStore } from "../stores/boat-store";
import { useWorldStore } from "../stores/world-store";
import { usePlaneKeys } from "./usePlaneKeys";
import { loadPlaneModel } from "../plane/plane-loader";
import { updatePlane, findRunwayPosition, type BuildingAABB } from "../plane/plane-physics";
import { createContrailEffects, type ContrailEffects } from "../plane/contrail-effects";
import type { SceneLayer } from "../viewer/scene-layer";

// ── Chase camera that works in 3D ──
const cam = {
  yawOffset: 0,
  pitchOffset: 0.25, // slight look-down by default
  distance: 60,
  dragging: false,
  lastPointerX: 0,
  lastPointerY: 0,
};

const CAM_PITCH_MIN = -0.3; // can look slightly above plane
const CAM_PITCH_MAX = Math.PI / 2 - 0.05;
const CAM_DIST_MIN = 20;
const CAM_DIST_MAX = 200;
const CAM_SENSITIVITY = 0.004;
const CAM_RETURN_SPEED = 1.0;
const CAM_HEIGHT_OFFSET = 3; // look-at target above plane center

const _cameraTarget = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _euler = new THREE.Euler();

export function usePlaneMode(
  layer: SceneLayer | null,
  onSyncPosition?: (x: number, y: number, z: number, heading: number, pitch: number, roll: number) => void,
  onExitPlane?: () => void
) {
  const keys = usePlaneKeys();
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const syncTimerRef = useRef<number>(0);
  const prevPlaneMode = useRef(false);
  const contrailRef = useRef<ContrailEffects | null>(null);
  const savedCamera = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

  // Building AABB cache — recompute every ~500ms
  const buildingAABBsRef = useRef<BuildingAABB[]>([]);
  const buildingCacheTimeRef = useRef<number>(0);
  const _box3 = useRef(new THREE.Box3());
  const _size = useRef(new THREE.Vector3());

  const layerRef = useRef(layer);
  layerRef.current = layer;
  const onSyncRef = useRef(onSyncPosition);
  onSyncRef.current = onSyncPosition;
  const onExitRef = useRef(onExitPlane);
  onExitRef.current = onExitPlane;

  const onPointerDown = useCallback((e: PointerEvent) => {
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
    cam.pitchOffset = THREE.MathUtils.clamp(
      cam.pitchOffset + dy * CAM_SENSITIVITY,
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
    if (!usePlaneStore.getState().planeMode) return;
    e.preventDefault();
    cam.distance = THREE.MathUtils.clamp(
      cam.distance + e.deltaY * 0.08,
      CAM_DIST_MIN,
      CAM_DIST_MAX
    );
  }, []);

  const onContextMenu = useCallback((e: MouseEvent) => {
    if (usePlaneStore.getState().planeMode) {
      e.preventDefault();
    }
  }, []);

  const tick = useCallback((now: number) => {
    const store = usePlaneStore.getState();
    if (!store.planeMode) return;

    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
    lastTimeRef.current = now;
    const nowSec = now / 1000;

    const remoteMap = store.remotePlanes;
    const remotePlanes = remoteMap
      ? Array.from(remoteMap.values(), (p) => ({ x: p.x, y: p.y, z: p.z }))
      : undefined;

    // Recompute building AABBs every 500ms (buildings rarely move)
    if (now - buildingCacheTimeRef.current > 500) {
      buildingCacheTimeRef.current = now;
      const containers = useWorldStore.getState().containers;
      const aabbs: BuildingAABB[] = [];
      for (const container of containers.values()) {
        if (!container.visible) continue;
        _box3.current.setFromObject(container);
        _size.current.copy(_box3.current.max).sub(_box3.current.min);
        // Skip tiny/degenerate boxes
        if (_size.current.x < 0.5 && _size.current.z < 0.5) continue;
        aabbs.push({
          minX: _box3.current.min.x,
          maxX: _box3.current.max.x,
          minY: _box3.current.min.y,
          maxY: _box3.current.max.y,
          minZ: _box3.current.min.z,
          maxZ: _box3.current.max.z,
        });
      }
      buildingAABBsRef.current = aabbs;
    }

    const newState = updatePlane(store.planePosition, keys.current!, dt, remotePlanes, buildingAABBsRef.current);
    store.updatePosition(newState);

    // Update Three.js plane group with full 3D rotation
    const planeGroup = store.planeGroup;
    if (planeGroup) {
      planeGroup.position.set(newState.x, newState.y, newState.z);
      // Rotation order: YXZ — heading(Y), pitch(X), roll(Z)
      // The model faces -Z by default, so we add PI to heading
      _euler.set(-newState.pitch, Math.PI - newState.heading, newState.roll, "YXZ");
      planeGroup.setRotationFromEuler(_euler);
    }

    // Contrail effects
    contrailRef.current?.update(
      newState.x,
      newState.y,
      newState.z,
      newState.heading,
      newState.pitch,
      newState.roll,
      newState.speed,
      newState.grounded,
      dt,
      nowSec
    );

    // ── 3D chase camera ──
    const currentLayer = layerRef.current;
    if (currentLayer) {
      const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;

      // Yaw auto-return
      if (!cam.dragging && Math.abs(cam.yawOffset) > 0.001) {
        const returnStep = CAM_RETURN_SPEED * dt;
        if (Math.abs(cam.yawOffset) < returnStep) {
          cam.yawOffset = 0;
        } else {
          cam.yawOffset -= Math.sign(cam.yawOffset) * returnStep;
        }
      }

      // Camera orbits behind and above the plane
      const orbitYaw = newState.heading + cam.yawOffset;
      const orbitPitch = cam.pitchOffset;

      const cosP = Math.cos(orbitPitch);
      const sinP = Math.sin(orbitPitch);

      _cameraPos.set(
        newState.x - Math.sin(orbitYaw) * cam.distance * cosP,
        newState.y + cam.distance * sinP + CAM_HEIGHT_OFFSET,
        newState.z + Math.cos(orbitYaw) * cam.distance * cosP
      );

      // Ensure camera doesn't go below ground
      _cameraPos.y = Math.max(_cameraPos.y, 2);

      const speed = Math.abs(newState.speed);
      const followLerp = cam.dragging
        ? 0.15
        : THREE.MathUtils.clamp(0.03 + speed * 0.002, 0.03, 0.1);
      camera.position.lerp(_cameraPos, followLerp);

      // Look at the plane
      _cameraTarget.set(newState.x, newState.y + CAM_HEIGHT_OFFSET, newState.z);
      camera.lookAt(_cameraTarget);

      currentLayer.repaint();
    }

    // Multiplayer sync (200ms debounce)
    if (onSyncRef.current && now - syncTimerRef.current > 200) {
      syncTimerRef.current = now;
      onSyncRef.current(
        newState.x, newState.y, newState.z,
        newState.heading, newState.pitch, newState.roll
      );
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [keys]);

  const enterPlaneMode = useCallback(async () => {
    const currentLayer = layerRef.current;
    if (!currentLayer) return;

    // Exit other vehicle modes
    if (useCarStore.getState().carMode) {
      useCarStore.getState().setCarMode(false);
    }
    if (useBoatStore.getState().boatMode) {
      useBoatStore.getState().setBoatMode(false);
    }

    const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;
    savedCamera.current = {
      position: camera.position.clone(),
      target: new THREE.Vector3(0, 0, 0),
    };

    currentLayer.setControlsEnabled(false);

    cam.yawOffset = 0;
    cam.pitchOffset = 0.25;
    cam.distance = 60;
    cam.dragging = false;

    const canvas = currentLayer.getCanvas();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    // Load plane model
    const planeGroup = await loadPlaneModel();
    planeGroup.name = "player-plane";
    currentLayer.addGroup(planeGroup);
    usePlaneStore.getState().setPlaneGroup(planeGroup);

    // Contrail effects
    const effects = createContrailEffects();
    contrailRef.current = effects;
    currentLayer.addGroup(effects.group);

    // Spawn on a road (runway)
    const runway = findRunwayPosition();
    usePlaneStore.getState().updatePosition({
      x: runway.x,
      y: 0.5,
      z: runway.z,
      heading: runway.heading,
      pitch: 0,
      roll: 0,
      speed: 0,
      grounded: true,
    });

    planeGroup.position.set(runway.x, 0.5, runway.z);
    planeGroup.rotation.set(0, Math.PI - runway.heading, 0);
    currentLayer.repaint();

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick, onPointerDown, onPointerMove, onPointerUp, onWheel, onContextMenu]);

  const exitPlaneMode = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    const planeGroup = usePlaneStore.getState().planeGroup;
    const currentLayer = layerRef.current;
    if (planeGroup && currentLayer) {
      currentLayer.removeGroup(planeGroup);
    }

    if (contrailRef.current && currentLayer) {
      currentLayer.removeGroup(contrailRef.current.group);
      contrailRef.current.dispose();
      contrailRef.current = null;
    }

    if (currentLayer) {
      const canvas = currentLayer.getCanvas();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    }

    usePlaneStore.getState().setPlaneGroup(null);
    usePlaneStore.getState().updatePosition({
      x: 0, y: 0.5, z: 0,
      heading: 0, pitch: 0, roll: 0,
      speed: 0, grounded: true,
    });

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

  // React to planeMode changes
  useEffect(() => {
    const unsub = usePlaneStore.subscribe((state) => {
      if (state.planeMode && !prevPlaneMode.current) {
        prevPlaneMode.current = true;
        enterPlaneMode();
      } else if (!state.planeMode && prevPlaneMode.current) {
        prevPlaneMode.current = false;
        exitPlaneMode();
      }
    });
    return () => {
      unsub();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enterPlaneMode, exitPlaneMode]);
}
