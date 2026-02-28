"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import type { ThreeJSMapboxLayer } from "../viewer/mapbox-layer";
import { useWorldStore } from "../stores/world-store";
import { GRASS_HALF_M } from "../grid/grid-constants";

type DragState = "idle" | "pending" | "dragging";

/** Axis-aligned bounding box obstacle for collision */
interface Obstacle {
  cx: number; // center X offset on the plot
  cz: number; // center Z offset on the plot
  halfX: number; // half-width on X
  halfZ: number; // half-width on Z
}

/**
 * Measure a container's XZ half-extents at its current scale,
 * ignoring its world-space position.
 */
function measureHalfExtents(
  container: THREE.Group,
  scale: number
): { halfX: number; halfZ: number } {
  const savedPos = container.position.clone();
  const savedScale = container.scale.clone();
  const savedRot = container.rotation.clone();
  container.position.set(0, 0, 0);
  container.scale.set(scale, scale, scale);
  container.rotation.set(0, 0, 0);

  const box = new THREE.Box3().setFromObject(container);

  container.position.copy(savedPos);
  container.scale.copy(savedScale);
  container.rotation.copy(savedRot);

  if (box.isEmpty()) return { halfX: 0, halfZ: 0 };
  const size = box.getSize(new THREE.Vector3());
  return { halfX: size.x / 2, halfZ: size.z / 2 };
}

/**
 * Click-to-select and drag-to-move buildings on the map.
 * - Only allows dragging buildings the current user owns
 * - Dynamic boundary clamping based on building bounding box
 * - AABB collision detection against sibling buildings on the same plot
 * - Click on empty space to deselect
 */
export function useBuildingDrag(
  mapRef: React.RefObject<mapboxgl.Map | null>,
  layer: ThreeJSMapboxLayer | null,
  ownedBuildingIds: Set<string>,
  plotCenters: Map<string, [number, number]>
) {
  const ownedRef = useRef(ownedBuildingIds);
  ownedRef.current = ownedBuildingIds;

  const centersRef = useRef(plotCenters);
  centersRef.current = plotCenters;

  const stateRef = useRef<DragState>("idle");
  const startPixelRef = useRef({ x: 0, y: 0 });
  const dragBuildingIdRef = useRef<string | null>(null);
  const dragStartOffsetRef = useRef<[number, number, number]>([0, 0, 0]);
  const dragAnchorRef = useRef({ x: 0, y: 0 });
  const dragYRef = useRef(0);

  // Per-drag cached data
  const dragSelfHalfRef = useRef({ halfX: 0, halfZ: 0 });
  const dragMaxOffsetRef = useRef({ x: GRASS_HALF_M, z: GRASS_HALF_M });
  const dragObstaclesRef = useRef<Obstacle[]>([]);

  const raycaster = useRef(new THREE.Raycaster());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layer) return;

    const canvas = map.getCanvas();

    function findBuildingId(obj: THREE.Object3D): string | null {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur.name?.startsWith("building-")) {
          return cur.name.slice("building-".length);
        }
        cur = cur.parent;
      }
      return null;
    }

    function raycastAtPixel(px: number, py: number): string | null {
      const scene = layer!.getScene();
      const camera = layer!.getCamera();
      if (!scene || !camera) return null;

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((px - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((py - rect.top) / rect.height) * 2 + 1;

      const origin = new THREE.Vector3(ndcX, ndcY, -1).applyMatrix4(
        camera.projectionMatrixInverse
      );
      const far = new THREE.Vector3(ndcX, ndcY, 1).applyMatrix4(
        camera.projectionMatrixInverse
      );
      raycaster.current.set(origin, far.sub(origin).normalize());

      const intersects = raycaster.current.intersectObjects(
        scene.children,
        true
      );
      for (const hit of intersects) {
        if (hit.object.parent?.name === "ground-planes") continue;
        const id = findBuildingId(hit.object);
        if (id) return id;
      }
      return null;
    }

    function pixelToPlotOffset(
      px: number,
      py: number,
      plotLng: number,
      plotLat: number
    ): [number, number] {
      const lngLat = map!.unproject(new mapboxgl.Point(px, py));
      const merc = mapboxgl.MercatorCoordinate.fromLngLat(lngLat, 0);
      const plotMerc = mapboxgl.MercatorCoordinate.fromLngLat(
        [plotLng, plotLat],
        0
      );
      const s = plotMerc.meterInMercatorCoordinateUnits();
      return [(merc.x - plotMerc.x) / s, (merc.y - plotMerc.y) / s];
    }

    /**
     * Snapshot all sibling buildings on the same plot as obstacles,
     * and compute the dragged building's own half-extents + max offset.
     */
    function prepareDragData(buildingId: string) {
      const state = useWorldStore.getState();
      const building = state.buildings.get(buildingId);
      const container = state.containers.get(buildingId);
      if (!building || !container) return;

      // Measure dragged building
      const selfHalf = measureHalfExtents(container, building.scale);
      dragSelfHalfRef.current = selfHalf;

      // Max offset = grass edge minus building half-extent
      dragMaxOffsetRef.current = {
        x: Math.max(0, GRASS_HALF_M - selfHalf.halfX),
        z: Math.max(0, GRASS_HALF_M - selfHalf.halfZ),
      };

      // Find sibling buildings on the same plot (same lng,lat in plotCenters)
      const myPlotCenter = centersRef.current.get(buildingId);
      const obstacles: Obstacle[] = [];

      if (myPlotCenter) {
        for (const [otherId, otherCenter] of centersRef.current) {
          if (otherId === buildingId) continue;
          // Same plot = same center coordinates
          if (
            otherCenter[0] !== myPlotCenter[0] ||
            otherCenter[1] !== myPlotCenter[1]
          )
            continue;

          const otherBuilding = state.buildings.get(otherId);
          const otherContainer = state.containers.get(otherId);
          if (!otherBuilding || !otherContainer) continue;

          const otherHalf = measureHalfExtents(
            otherContainer,
            otherBuilding.scale
          );

          obstacles.push({
            cx: otherBuilding.offset[0],
            cz: otherBuilding.offset[2],
            halfX: otherHalf.halfX,
            halfZ: otherHalf.halfZ,
          });
        }
      }

      dragObstaclesRef.current = obstacles;
    }

    /**
     * Resolve AABB collisions: given a proposed position for the dragged
     * building, push it out of any overlapping siblings.
     * Uses iterative resolution (up to 4 passes) for multi-body pileups.
     */
    function resolveCollisions(proposedX: number, proposedZ: number): [number, number] {
      let x = proposedX;
      let z = proposedZ;
      const selfHX = dragSelfHalfRef.current.halfX;
      const selfHZ = dragSelfHalfRef.current.halfZ;
      const obstacles = dragObstaclesRef.current;

      // Small gap (1m) to prevent buildings from touching flush
      const GAP = 1;

      for (let pass = 0; pass < 4; pass++) {
        let resolved = true;
        for (const obs of obstacles) {
          const overlapX =
            selfHX + obs.halfX + GAP - Math.abs(x - obs.cx);
          const overlapZ =
            selfHZ + obs.halfZ + GAP - Math.abs(z - obs.cz);

          if (overlapX > 0 && overlapZ > 0) {
            resolved = false;
            // Push along the axis with least penetration
            if (overlapX < overlapZ) {
              x += x >= obs.cx ? overlapX : -overlapX;
            } else {
              z += z >= obs.cz ? overlapZ : -overlapZ;
            }
          }
        }
        if (resolved) break;
      }

      return [x, z];
    }

    // ── Event handlers ──────────────────────────────────────

    const onMouseDown = (e: MouseEvent) => {
      const hitId = raycastAtPixel(e.clientX, e.clientY);

      if (!hitId) {
        useWorldStore.getState().selectBuilding(null);
        return;
      }

      if (!ownedRef.current.has(hitId)) {
        useWorldStore.getState().selectBuilding(null);
        return;
      }

      const building = useWorldStore.getState().buildings.get(hitId);
      if (!building) return;

      e.stopPropagation();
      useWorldStore.getState().selectBuilding(hitId);

      // Snapshot drag data: self extents, boundary limits, sibling obstacles
      prepareDragData(hitId);

      stateRef.current = "pending";
      dragBuildingIdRef.current = hitId;
      startPixelRef.current = { x: e.clientX, y: e.clientY };
      dragStartOffsetRef.current = [...building.offset];
      dragYRef.current = building.offset[1];

      const plotCenter = centersRef.current.get(hitId);
      if (plotCenter) {
        const [ox, oz] = pixelToPlotOffset(
          e.clientX,
          e.clientY,
          plotCenter[0],
          plotCenter[1]
        );
        dragAnchorRef.current = { x: ox, y: oz };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (stateRef.current === "idle") {
        const hitId = raycastAtPixel(e.clientX, e.clientY);
        canvas.style.cursor =
          hitId && ownedRef.current.has(hitId) ? "grab" : "";
        return;
      }

      if (stateRef.current === "pending") {
        const dx = e.clientX - startPixelRef.current.x;
        const dy = e.clientY - startPixelRef.current.y;
        if (dx * dx + dy * dy < 16) return;

        stateRef.current = "dragging";
        useWorldStore.getState().setIsDragging(true);
        canvas.style.cursor = "grabbing";
        map!.dragPan.disable();
      }

      if (stateRef.current === "dragging") {
        const buildingId = dragBuildingIdRef.current;
        if (!buildingId) return;

        const plotCenter = centersRef.current.get(buildingId);
        if (!plotCenter) return;

        const [mx, mz] = pixelToPlotOffset(
          e.clientX,
          e.clientY,
          plotCenter[0],
          plotCenter[1]
        );

        // 1. Compute raw proposed position
        let newX =
          dragStartOffsetRef.current[0] + (mx - dragAnchorRef.current.x);
        let newZ =
          dragStartOffsetRef.current[2] + (mz - dragAnchorRef.current.y);

        // 2. Clamp to grass boundary
        const maxX = dragMaxOffsetRef.current.x;
        const maxZ = dragMaxOffsetRef.current.z;
        newX = Math.max(-maxX, Math.min(maxX, newX));
        newZ = Math.max(-maxZ, Math.min(maxZ, newZ));

        // 3. Resolve collisions with sibling buildings
        [newX, newZ] = resolveCollisions(newX, newZ);

        // 4. Re-clamp after collision resolution (push might exceed boundary)
        newX = Math.max(-maxX, Math.min(maxX, newX));
        newZ = Math.max(-maxZ, Math.min(maxZ, newZ));

        useWorldStore
          .getState()
          .updateTransform(buildingId, {
            offset: [newX, dragYRef.current, newZ],
          });
      }
    };

    const onMouseUp = () => {
      const prev = stateRef.current;

      if (prev === "dragging" || prev === "pending") {
        map!.dragPan.enable();
        useWorldStore.getState().setIsDragging(false);
      }

      stateRef.current = "idle";
      dragBuildingIdRef.current = null;
      dragObstaclesRef.current = [];
      canvas.style.cursor = "";
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (stateRef.current === "dragging") {
        map!.dragPan.enable();
      }
      stateRef.current = "idle";
    };
  }, [mapRef, layer]);
}
