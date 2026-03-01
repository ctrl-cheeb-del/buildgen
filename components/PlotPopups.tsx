"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import type { SceneLayer } from "@/lib/viewer/scene-layer";
import type { PlotState } from "@/lib/grid/grid-geometry";
import { useWorldStore } from "@/lib/stores/world-store";
import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  PAVEMENT_WIDTH_M,
  GRID_STEP_M,
} from "@/lib/grid/grid-constants";
import { getActiveNPCManager } from "@/lib/npc/npc-manager";

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _screenPos = new THREE.Vector3();

interface PlotPopupsProps {
  layer: SceneLayer | null;
  plotStates: PlotState[];
  onPlotClick?: (plotIndex: number) => void;
}

/** Escape HTML special chars to prevent XSS in innerHTML */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Plot interaction overlay: invisible hit-test meshes + HTML popups.
 * Handles click-to-claim and hover tooltips via Three.js raycasting.
 */
export default function PlotPopups({
  layer,
  plotStates,
  onPlotClick,
}: PlotPopupsProps) {
  const clickTargetsRef = useRef<THREE.Group | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<HTMLDivElement | null>(null);
  const onPlotClickRef = useRef(onPlotClick);
  onPlotClickRef.current = onPlotClick;
  const plotStatesRef = useRef(plotStates);
  plotStatesRef.current = plotStates;

  // Build click targets and add to scene
  useEffect(() => {
    if (!layer) return;

    const group = new THREE.Group();
    group.name = "plot-click-targets";

    const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
    const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
    const startX = -totalW / 2;
    const startZ = -totalH / 2;

    const innerSize = PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M;
    const sharedGeo = new THREE.PlaneGeometry(innerSize, innerSize);
    const invisibleMat = new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.DoubleSide,
    });

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const plotIndex = r * GRID_COLS + c;
        const px = startX + ROAD_WIDTH_M + c * GRID_STEP_M + PAVEMENT_WIDTH_M;
        const pz = startZ + ROAD_WIDTH_M + r * GRID_STEP_M + PAVEMENT_WIDTH_M;

        const mesh = new THREE.Mesh(sharedGeo, invisibleMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(px + innerSize / 2, 0.2, pz + innerSize / 2);
        mesh.userData = { plotIndex };
        group.add(mesh);
      }
    }

    layer.getScene().add(group);
    clickTargetsRef.current = group;

    return () => {
      layer.getScene().remove(group);
      sharedGeo.dispose();
      invisibleMat.dispose();
      clickTargetsRef.current = null;
    };
  }, [layer]);

  const setNdc = useCallback(
    (px: number, py: number) => {
      if (!layer) return false;
      const canvas = layer.getCanvas();
      const rect = canvas.getBoundingClientRect();
      _ndc.x = ((px - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((py - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, layer.getCamera());
      return true;
    },
    [layer]
  );

  const raycastPlot = useCallback(
    (px: number, py: number) => {
      if (!clickTargetsRef.current || !setNdc(px, py)) return null;

      const hits = _raycaster.intersectObjects(
        clickTargetsRef.current.children,
        false
      );
      if (hits.length === 0) return null;
      const hit = hits[0];
      const plotIndex = hit.object.userData.plotIndex;
      if (plotIndex === undefined) return null;
      return { plotIndex, worldPos: hit.object.position };
    },
    [setNdc]
  );

  /** Raycast against building containers (not full scene). */
  const raycastBuilding = useCallback(
    (px: number, py: number) => {
      if (!setNdc(px, py)) return null;

      const { buildings, containers } = useWorldStore.getState();
      if (containers.size === 0) return null;

      const targets = Array.from(containers.values());
      const hits = _raycaster.intersectObjects(targets, true);
      if (hits.length === 0) return null;

      // Walk up to find the building container (named "building-{id}")
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj.name.startsWith("building-")) {
          const buildingId = obj.name.slice("building-".length);
          const building = buildings.get(buildingId);
          if (building) {
            return {
              buildingId,
              buildingName: building.name,
              worldPos: hits[0].point,
            };
          }
        }
        obj = obj.parent;
      }
      return null;
    },
    [setNdc]
  );

  const worldToScreen = useCallback(
    (worldPos: THREE.Vector3): { x: number; y: number } | null => {
      if (!layer) return null;
      const camera = layer.getCamera() as THREE.PerspectiveCamera;
      const canvas = layer.getCanvas();
      _screenPos.copy(worldPos);
      _screenPos.y = 5;
      _screenPos.project(camera);
      if (_screenPos.z > 1) return null; // behind camera
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((_screenPos.x + 1) / 2) * rect.width + rect.left,
        y: ((-_screenPos.y + 1) / 2) * rect.height + rect.top,
      };
    },
    [layer]
  );

  // Remove popup
  const removePopup = useCallback(() => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, []);

  const removeHover = useCallback(() => {
    if (hoverRef.current) {
      hoverRef.current.remove();
      hoverRef.current = null;
    }
  }, []);

  // Click handler
  useEffect(() => {
    if (!layer) return;
    const canvas = layer.getCanvas();

    const onClick = (e: MouseEvent) => {
      if (useWorldStore.getState().isDragging) return;

      // Try building-level raycast first
      const bHit = raycastBuilding(e.clientX, e.clientY);
      if (bHit) {
        removePopup();
        removeHover();

        const screen = worldToScreen(
          new THREE.Vector3(bHit.worldPos.x, bHit.worldPos.y + 5, bHit.worldPos.z)
        );
        if (!screen) return;

        const popup = document.createElement("div");
        popup.style.cssText = `
          position: fixed; z-index: 50;
          left: ${screen.x}px; top: ${screen.y - 10}px;
          transform: translate(-50%, -100%);
          background: white; border-radius: 8px; padding: 8px 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          pointer-events: auto; font-family: system-ui;
          max-width: 220px;
        `;
        popup.innerHTML = `
          <div style="text-align:center;padding:4px 0">
            <div style="font-size:13px;font-weight:600;color:#374151">${esc(bHit.buildingName)}</div>
          </div>`;

        document.body.appendChild(popup);
        popupRef.current = popup;

        const dismiss = (ev: MouseEvent) => {
          if (!popup.contains(ev.target as Node)) {
            removePopup();
            document.removeEventListener("click", dismiss, true);
          }
        };
        setTimeout(() => document.addEventListener("click", dismiss, true), 0);
        return;
      }

      // Fall back to plot-level raycast
      const result = raycastPlot(e.clientX, e.clientY);
      if (!result) {
        removePopup();
        return;
      }

      const { plotIndex, worldPos } = result;
      const state = plotStatesRef.current.find((p) => p.index === plotIndex);
      if (!state) return;

      removePopup();
      removeHover();

      const screen = worldToScreen(worldPos);
      if (!screen) return;

      const popup = document.createElement("div");
      popup.style.cssText = `
        position: fixed; z-index: 50;
        left: ${screen.x}px; top: ${screen.y - 10}px;
        transform: translate(-50%, -100%);
        background: white; border-radius: 8px; padding: 8px 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        pointer-events: auto; font-family: system-ui;
      `;

      if (state.status === "empty") {
        popup.innerHTML = `
          <div style="text-align:center;padding:4px 0">
            <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Plot #${plotIndex}</div>
            <button
              id="claim-btn"
              style="background:#3b82f6;color:white;border:none;padding:5px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer"
            >Claim this plot</button>
          </div>`;
      } else if (state.status === "generating") {
        const agentLine = state.isAgentOwned && state.agentName
          ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">by ${esc(state.agentName)}</div>`
          : "";
        popup.innerHTML = `
          <div style="text-align:center;padding:6px 0">
            <div style="display:inline-flex;align-items:center;gap:6px;margin-bottom:4px">
              <div style="width:12px;height:12px;border:2px solid #3b82f6;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>
              <span style="font-size:13px;font-weight:600;color:#3b82f6">Generating</span>
            </div>
            ${agentLine}
            <div style="font-size:10px;color:#9ca3af;margin-top:4px">Plot #${plotIndex}</div>
          </div>
          <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
      } else if (state.isAgentOwned && state.agentName) {
        const buildingList = state.buildingPrompts?.length
          ? state.buildingPrompts
              .map(
                (p) =>
                  `<div style="font-size:11px;color:#374151;margin-top:2px">${esc(p)}</div>`
              )
              .join("")
          : "";
        popup.innerHTML = `
          <div style="text-align:center;padding:6px 0">
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Agent</div>
            <div style="font-size:13px;font-weight:600;color:#374151">${esc(state.agentName)}</div>
            ${buildingList}
            <div style="font-size:10px;color:#9ca3af;margin-top:4px">Plot #${plotIndex} &middot; ${esc(state.status)}</div>
          </div>`;
      } else if (state.ownerName) {
        const avatarHtml = state.ownerAvatar
          ? `<img src="${esc(state.ownerAvatar)}" style="width:32px;height:32px;border-radius:50%;margin:0 auto 6px" />`
          : "";
        const nameHtml = state.ownerUsername
          ? `<a href="https://x.com/${encodeURIComponent(state.ownerUsername)}" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;color:#374151;text-decoration:none">${esc(state.ownerName)}</a>
             <div style="font-size:11px;color:#9ca3af">@${esc(state.ownerUsername)}</div>`
          : `<div style="font-size:13px;font-weight:600;color:#374151">${esc(state.ownerName)}</div>`;
        const buildingList = state.buildingPrompts?.length
          ? `<div style="margin-top:4px;border-top:1px solid #f3f4f6;padding-top:4px">${state.buildingPrompts
              .map(
                (p) =>
                  `<div style="font-size:11px;color:#374151">${esc(p)}</div>`
              )
              .join("")}</div>`
          : "";
        popup.innerHTML = `
          <div style="text-align:center;padding:6px 0">
            ${avatarHtml}
            ${nameHtml}
            ${buildingList}
            <div style="font-size:10px;color:#9ca3af;margin-top:4px">Plot #${plotIndex} &middot; ${esc(state.status)}</div>
          </div>`;
      } else {
        popup.innerHTML = `
          <div style="text-align:center;padding:4px 0">
            <div style="font-size:12px;color:#9ca3af">Plot #${plotIndex} &middot; ${esc(state.status)}</div>
          </div>`;
      }

      document.body.appendChild(popup);
      popupRef.current = popup;

      if (state.status === "empty") {
        setTimeout(() => {
          const btn = document.getElementById("claim-btn");
          if (btn) {
            btn.addEventListener("click", () => {
              onPlotClickRef.current?.(plotIndex);
              removePopup();
            });
          }
        }, 0);
      }

      // Auto-dismiss on next click outside
      const dismiss = (ev: MouseEvent) => {
        if (!popup.contains(ev.target as Node)) {
          removePopup();
          document.removeEventListener("click", dismiss, true);
        }
      };
      setTimeout(() => document.addEventListener("click", dismiss, true), 0);
    };

    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [layer, raycastPlot, raycastBuilding, worldToScreen, removePopup, removeHover]);

  // Hover handler
  useEffect(() => {
    if (!layer) return;
    const canvas = layer.getCanvas();

    let rafPending = false;
    let lastMoveEvent: MouseEvent | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (useWorldStore.getState().isDragging) {
        removeHover();
        return;
      }

      // NPC hover — check instanced meshes
      const npcManager = getActiveNPCManager();
      if (npcManager && setNdc(e.clientX, e.clientY)) {
        const carMesh = npcManager.getCarMesh();
        const pedMesh = npcManager.getPedMesh();
        const npcHits = _raycaster.intersectObjects([carMesh, pedMesh], false);
        if (npcHits.length > 0) {
          const hit = npcHits[0];
          const instanceId = hit.instanceId;
          if (instanceId !== undefined) {
            const isCar = hit.object === carMesh;
            const identity = isCar
              ? npcManager.getNPCAtCarInstance(instanceId)
              : npcManager.getNPCAtPedInstance(instanceId);
            if (identity) {
              canvas.style.cursor = "pointer";
              if (!hoverRef.current) {
                const hover = document.createElement("div");
                hover.style.cssText = `
                  position: fixed; z-index: 49; pointer-events: none;
                  background: rgba(99,102,241,0.9); border-radius: 6px; padding: 4px 8px;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                  font-family: system-ui; white-space: nowrap; color: white;
                `;
                document.body.appendChild(hover);
                hoverRef.current = hover;
              }
              const hover = hoverRef.current;
              hover.style.background = "rgba(99,102,241,0.9)";
              hover.style.color = "white";
              hover.style.left = `${e.clientX}px`;
              hover.style.top = `${e.clientY - 24}px`;
              hover.style.transform = "translate(-50%, -100%)";
              const actLabel = identity.activity.type === "strolling"
                ? `${esc(identity.name)} strolling`
                : `${esc(identity.name)} → ${esc(identity.activity.destinationLabel)}`;
              hover.innerHTML = `<div style="font-size:11px;font-weight:600;text-align:center">${actLabel}</div>`;
              return;
            }
          }
        }
      }

      // Show pointer cursor on buildings (click to see name)
      const bHit = raycastBuilding(e.clientX, e.clientY);
      if (bHit) {
        canvas.style.cursor = "pointer";
        removeHover();
        return;
      }

      // Plot-level hover
      const result = raycastPlot(e.clientX, e.clientY);
      if (!result) {
        removeHover();
        canvas.style.cursor = "";
        return;
      }

      const { plotIndex, worldPos } = result;
      const state = plotStatesRef.current.find((p) => p.index === plotIndex);
      if (!state) {
        removeHover();
        canvas.style.cursor = "";
        return;
      }

      if (state.status === "empty") {
        canvas.style.cursor = "pointer";
      } else if (state.ownerName || state.isAgentOwned || state.status === "generating") {
        canvas.style.cursor = "pointer";
      } else {
        removeHover();
        canvas.style.cursor = "";
        return;
      }

      const screen = worldToScreen(worldPos);
      if (!screen) {
        removeHover();
        return;
      }

      if (!hoverRef.current) {
        const hover = document.createElement("div");
        hover.style.cssText = `
          position: fixed; z-index: 49; pointer-events: none;
          background: white; border-radius: 6px; padding: 4px 8px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.1);
          font-family: system-ui; white-space: nowrap;
        `;
        document.body.appendChild(hover);
        hoverRef.current = hover;
      }

      const hover = hoverRef.current;
      hover.style.left = `${screen.x}px`;
      hover.style.top = `${screen.y - 10}px`;
      hover.style.transform = "translate(-50%, -100%)";

      if (state.status === "empty") {
        hover.innerHTML = `<div style="font-size:11px;color:#6b7280;text-align:center">Plot #${plotIndex}<br><span style="color:#3b82f6;font-weight:600">Click to claim</span></div>`;
      } else if (state.status === "generating") {
        const agentLabel = state.isAgentOwned && state.agentName ? ` (${esc(state.agentName)})` : "";
        hover.innerHTML = `<div style="font-size:11px;text-align:center;color:#3b82f6;font-weight:600">Generating...${agentLabel}</div>`;
      } else if (state.isAgentOwned && state.agentName) {
        hover.innerHTML = `<div style="font-size:11px;text-align:center"><span style="font-weight:600;color:#374151">${esc(state.agentName)}</span><br><span style="color:#9ca3af">Plot #${plotIndex}</span></div>`;
      } else if (state.ownerName) {
        const avatar = state.ownerAvatar
          ? `<img src="${esc(state.ownerAvatar)}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:4px" />`
          : "";
        const display = state.ownerUsername
          ? `@${esc(state.ownerUsername)}`
          : esc(state.ownerName);
        hover.innerHTML = `<div style="font-size:11px;text-align:center;display:flex;align-items:center;justify-content:center;gap:4px">${avatar}<span style="font-weight:600;color:#374151">${display}</span></div>`;
      }
    };

    const onMouseLeave = () => {
      removeHover();
      canvas.style.cursor = "";
    };

    const onMouseMoveThrottled = (e: MouseEvent) => {
      lastMoveEvent = e;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (lastMoveEvent) onMouseMove(lastMoveEvent);
      });
    };

    canvas.addEventListener("mousemove", onMouseMoveThrottled);
    canvas.addEventListener("mouseleave", onMouseLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMouseMoveThrottled);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      removeHover();
    };
  }, [layer, raycastPlot, raycastBuilding, worldToScreen, removeHover]);

  // Clean up popups on unmount
  useEffect(() => {
    return () => {
      removePopup();
      removeHover();
    };
  }, [removePopup, removeHover]);

  // Dismiss popups when dragging starts
  useEffect(() => {
    let wasDragging = false;
    const unsub = useWorldStore.subscribe((s) => {
      if (s.isDragging && !wasDragging) {
        removePopup();
        removeHover();
      }
      wasDragging = s.isDragging;
    });
    return unsub;
  }, [removePopup, removeHover]);

  return null; // Renders via DOM manipulation, no React tree needed
}
