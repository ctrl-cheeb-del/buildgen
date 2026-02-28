"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useBoatStore } from "../stores/boat-store";
import { useCarStore } from "../stores/car-store";
import { useBoatKeys } from "./useBoatKeys";
import { loadBoatModel } from "../boat/boat-loader";
import { updateBoat, findNearestWaterPosition } from "../boat/boat-physics";
import { createWakeEffects, type WakeEffects } from "../boat/wake-effects";
import type { SceneLayer } from "../viewer/scene-layer";

function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ── GTA V-style chase camera state (same pattern as car) ──
const cam = {
  yawOffset: 0,
  pitch: 0.4,       // slightly more top-down for water
  distance: 50,      // further back for boat
  dragging: false,
  lastPointerX: 0,
  lastPointerY: 0,
};

const CAM_PITCH_MIN = 0.05;
const CAM_PITCH_MAX = Math.PI / 2 - 0.05;
const CAM_DIST_MIN = 15;
const CAM_DIST_MAX = 150;
const CAM_SENSITIVITY = 0.004;
const CAM_RETURN_SPEED = 1.5;
const CAM_HEIGHT_OFFSET = 2;

const BOAT_Y = -4.5; // boat floats on water (ocean plane is at y=-6)

const _cameraTarget = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();

export function useBoatMode(
  layer: SceneLayer | null,
  onSyncPosition?: (x: number, z: number, heading: number) => void,
  onExitBoat?: () => void
) {
  const keys = useBoatKeys();
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const syncTimerRef = useRef<number>(0);
  const prevBoatMode = useRef(false);
  const wakeEffectsRef = useRef<WakeEffects | null>(null);
  const savedCamera = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

  const layerRef = useRef(layer);
  layerRef.current = layer;
  const onSyncRef = useRef(onSyncPosition);
  onSyncRef.current = onSyncPosition;
  const onExitRef = useRef(onExitBoat);
  onExitRef.current = onExitBoat;

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
    if (!useBoatStore.getState().boatMode) return;
    e.preventDefault();
    cam.distance = THREE.MathUtils.clamp(
      cam.distance + e.deltaY * 0.05,
      CAM_DIST_MIN,
      CAM_DIST_MAX
    );
  }, []);

  const onContextMenu = useCallback((e: MouseEvent) => {
    if (useBoatStore.getState().boatMode) {
      e.preventDefault();
    }
  }, []);

  const tick = useCallback((now: number) => {
    const boatStore = useBoatStore.getState();
    if (!boatStore.boatMode) return;

    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
    lastTimeRef.current = now;
    const nowSec = now / 1000;

    const remoteMap = boatStore.remoteBoats;
    const remoteBoats = remoteMap
      ? Array.from(remoteMap.values(), (b) => ({ x: b.x, z: b.z }))
      : undefined;

    const newState = updateBoat(boatStore.boatPosition, keys.current!, dt, remoteBoats);
    boatStore.updatePosition(newState);

    const boatGroup = boatStore.boatGroup;
    if (boatGroup) {
      // Bob up and down slightly with a sine wave for water feel
      const bob = Math.sin(nowSec * 1.5) * 0.3;
      const roll = Math.sin(nowSec * 0.8) * 0.03; // gentle roll
      boatGroup.position.set(newState.x, BOAT_Y + bob, newState.z);
      boatGroup.rotation.set(roll, Math.PI - newState.heading, 0);
    }

    // Update wake effects
    const driftAngle = wrapAngle(newState.heading - newState.velAngle);
    wakeEffectsRef.current?.update(
      newState.x,
      newState.z,
      newState.heading,
      newState.drifting,
      driftAngle,
      Math.abs(newState.speed),
      dt,
      nowSec
    );

    // Chase camera
    const currentLayer = layerRef.current;
    if (currentLayer) {
      const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;

      if (!cam.dragging && Math.abs(cam.yawOffset) > 0.001) {
        const returnStep = CAM_RETURN_SPEED * dt;
        if (Math.abs(cam.yawOffset) < returnStep) {
          cam.yawOffset = 0;
        } else {
          cam.yawOffset -= Math.sign(cam.yawOffset) * returnStep;
        }
      }

      const orbitAngle = newState.heading + cam.yawOffset;
      const cosP = Math.cos(cam.pitch);
      const sinP = Math.sin(cam.pitch);
      _cameraPos.set(
        newState.x - Math.sin(orbitAngle) * cam.distance * cosP,
        cam.distance * sinP,
        newState.z + Math.cos(orbitAngle) * cam.distance * cosP
      );

      const speed = Math.abs(newState.speed);
      const followLerp = cam.dragging
        ? 0.15
        : THREE.MathUtils.clamp(0.04 + speed * 0.003, 0.04, 0.12);
      camera.position.lerp(_cameraPos, followLerp);

      _cameraTarget.set(newState.x, CAM_HEIGHT_OFFSET, newState.z);
      camera.lookAt(_cameraTarget);

      currentLayer.repaint();
    }

    // Multiplayer sync
    if (onSyncRef.current && now - syncTimerRef.current > 200) {
      syncTimerRef.current = now;
      onSyncRef.current(newState.x, newState.z, newState.heading);
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [keys]);

  const enterBoatMode = useCallback(async () => {
    const currentLayer = layerRef.current;
    if (!currentLayer) return;

    // Exit car mode if active
    if (useCarStore.getState().carMode) {
      useCarStore.getState().setCarMode(false);
    }

    const camera = currentLayer.getCamera() as THREE.PerspectiveCamera;
    savedCamera.current = {
      position: camera.position.clone(),
      target: new THREE.Vector3(0, 0, 0),
    };

    currentLayer.setControlsEnabled(false);

    cam.yawOffset = 0;
    cam.pitch = 0.4;
    cam.distance = 50;
    cam.dragging = false;

    const canvas = currentLayer.getCanvas();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    const boatGroup = await loadBoatModel();
    boatGroup.name = "player-boat";
    currentLayer.addGroup(boatGroup);
    useBoatStore.getState().setBoatGroup(boatGroup);

    const effects = createWakeEffects();
    wakeEffectsRef.current = effects;
    currentLayer.addGroup(effects.group);

    // Spawn just outside the south edge of the grid
    const waterPos = findNearestWaterPosition(0, 800);
    useBoatStore.getState().updatePosition({
      x: waterPos.x,
      z: waterPos.z,
      heading: 0,
      speed: 0,
      velAngle: 0,
      drifting: false,
    });

    const bob = 0;
    boatGroup.position.set(waterPos.x, BOAT_Y + bob, waterPos.z);
    boatGroup.rotation.set(0, Math.PI, 0);
    currentLayer.repaint();

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick, onPointerDown, onPointerMove, onPointerUp, onWheel, onContextMenu]);

  const exitBoatMode = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    const boatGroup = useBoatStore.getState().boatGroup;
    const currentLayer = layerRef.current;
    if (boatGroup && currentLayer) {
      currentLayer.removeGroup(boatGroup);
    }

    if (wakeEffectsRef.current && currentLayer) {
      currentLayer.removeGroup(wakeEffectsRef.current.group);
      wakeEffectsRef.current.dispose();
      wakeEffectsRef.current = null;
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

    useBoatStore.getState().setBoatGroup(null);
    useBoatStore.getState().updatePosition({
      x: 0, z: 0, heading: 0, speed: 0, velAngle: 0, drifting: false,
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

  // React to boatMode changes
  useEffect(() => {
    const unsub = useBoatStore.subscribe((state) => {
      if (state.boatMode && !prevBoatMode.current) {
        prevBoatMode.current = true;
        enterBoatMode();
      } else if (!state.boatMode && prevBoatMode.current) {
        prevBoatMode.current = false;
        exitBoatMode();
      }
    });
    return () => {
      unsub();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enterBoatMode, exitBoatMode]);
}
