"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { useCarStore } from "../stores/car-store";
import { useCarKeys } from "./useCarKeys";
import { loadCarModel } from "../car/car-loader";
import { updateCar, findNearestRoadPosition } from "../car/car-physics";
import { createDriftEffects, type DriftEffects } from "../car/drift-effects";
import {
  CITY_ORIGIN_LNG,
  CITY_ORIGIN_LAT,
} from "../grid/grid-constants";
import type { ThreeJSMapboxLayer } from "../viewer/mapbox-layer";

function metersToLngLat(dx: number, dz: number): [number, number] {
  const originMerc = mapboxgl.MercatorCoordinate.fromLngLat(
    [CITY_ORIGIN_LNG, CITY_ORIGIN_LAT],
    0
  );
  const scale = originMerc.meterInMercatorCoordinateUnits();
  const merc = new mapboxgl.MercatorCoordinate(
    originMerc.x + dx * scale,
    originMerc.y + dz * scale,
    0
  );
  const lngLat = merc.toLngLat();
  return [lngLat.lng, lngLat.lat];
}

function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function useCarMode(
  mapRef: React.RefObject<mapboxgl.Map | null>,
  layer: ThreeJSMapboxLayer | null,
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
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  } | null>(null);

  // Store latest callback refs to avoid stale closures in animation loop
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const mapRefRef = useRef(mapRef);
  mapRefRef.current = mapRef;
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

    // Physics update
    const newState = updateCar(carStore.carPosition, keys.current!, dt);
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

    layerRef.current?.repaint();

    // Camera follow via Mapbox — allow user's current zoom (scroll zoom enabled)
    const map = mapRefRef.current.current;
    if (map) {
      const [lng, lat] = metersToLngLat(newState.x, newState.z);
      const bearingDeg = newState.heading * (180 / Math.PI);
      map.jumpTo({
        center: [lng, lat],
        bearing: bearingDeg,
        pitch: 60,
      });
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
    const map = mapRefRef.current.current;
    if (!currentLayer || !map) return;

    // Save current camera
    const c = map.getCenter();
    savedCamera.current = {
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };

    // Disable map interaction except scroll zoom (for drone-style zoom in/out)
    map.dragPan.disable();
    map.dragRotate.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();

    // Load car model
    const carGroup = await loadCarModel();
    carGroup.name = "player-car";
    currentLayer.addGroup(carGroup);
    useCarStore.getState().setCarGroup(carGroup);

    // Create drift effects and add to scene
    const effects = createDriftEffects();
    driftEffectsRef.current = effects;
    currentLayer.addGroup(effects.group);

    // Place car on nearest road from current view center
    const viewCenter = map.getCenter();
    const originMerc = mapboxgl.MercatorCoordinate.fromLngLat(
      [CITY_ORIGIN_LNG, CITY_ORIGIN_LAT],
      0
    );
    const viewMerc = mapboxgl.MercatorCoordinate.fromLngLat(
      [viewCenter.lng, viewCenter.lat],
      0
    );
    const meterScale = currentLayer.getMeterScale();
    const meterX = (viewMerc.x - originMerc.x) / meterScale;
    const meterZ = (viewMerc.y - originMerc.y) / meterScale;

    const roadPos = findNearestRoadPosition(meterX, meterZ);
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

    // Zoom in close to the car
    map.jumpTo({ zoom: 19.5, pitch: 60 });

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
    useCarStore.getState().updatePosition({ x: 0, z: 0, heading: 0, speed: 0, velAngle: 0, drifting: false });

    // Restore map controls
    const map = mapRefRef.current.current;
    if (map) {
      map.dragPan.enable();
      map.dragRotate.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();

      if (savedCamera.current) {
        map.jumpTo({
          center: savedCamera.current.center,
          zoom: savedCamera.current.zoom,
          pitch: savedCamera.current.pitch,
          bearing: savedCamera.current.bearing,
        });
      }
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
