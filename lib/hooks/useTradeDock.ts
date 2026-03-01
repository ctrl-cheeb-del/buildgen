"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useWorldStore } from "../stores/world-store";
import { loadBoatModel } from "../boat/boat-loader";
import { createTradeDock, SHIP_DOCK_POSITION, SHIP_OFFSCREEN_POSITION } from "../trade/trade-dock";
import * as THREE from "three";
import type { SceneLayer } from "../viewer/scene-layer";

const ARRIVAL_DURATION = 5000; // 5 seconds for ship to sail in
const DEPARTURE_DURATION = 5000;
const TICKS_VISIBLE = 2; // ship stays for 2 ticks

export function useTradeDock(layer: SceneLayer | null) {
  const city = useQuery(api.simulation.cityState.get);
  const dockGroupRef = useRef<THREE.Group | null>(null);
  const shipGroupRef = useRef<THREE.Group | null>(null);
  const shipLoadedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastShipTickRef = useRef<number>(0);

  // Animation state
  const animRef = useRef<{
    state: "hidden" | "arriving" | "docked" | "departing";
    startTime: number;
  }>({ state: "hidden", startTime: 0 });

  // Create dock geometry on mount
  useEffect(() => {
    if (!layer) return;

    const dock = createTradeDock();
    dockGroupRef.current = dock;
    layer.addGroup(dock);

    // Load trade ship (scaled-up boat)
    if (!shipLoadedRef.current) {
      shipLoadedRef.current = true;
      loadBoatModel().then((boatGroup) => {
        boatGroup.name = "trade-ship";
        // Scale up 2x for trade ship feel
        boatGroup.scale.set(2, 2, 2);
        boatGroup.position.copy(SHIP_OFFSCREEN_POSITION);
        boatGroup.visible = false;
        shipGroupRef.current = boatGroup;
        layer.addGroup(boatGroup);
      });
    }

    return () => {
      if (dockGroupRef.current) {
        layer.removeGroup(dockGroupRef.current);
        dockGroupRef.current = null;
      }
      if (shipGroupRef.current) {
        layer.removeGroup(shipGroupRef.current);
        shipGroupRef.current = null;
        shipLoadedRef.current = false;
      }
    };
  }, [layer]);

  // Watch tradeStats for ship arrivals
  useEffect(() => {
    if (!city?.tradeStats) return;

    const { lastShipTick } = city.tradeStats;
    const currentTick = city.totalTicks;

    // New ship arrived
    if (lastShipTick > lastShipTickRef.current && lastShipTick > 0) {
      animRef.current = { state: "arriving", startTime: performance.now() };
    }
    // Ship should depart (2+ ticks since dock)
    else if (
      animRef.current.state === "docked" &&
      currentTick - lastShipTick >= TICKS_VISIBLE
    ) {
      animRef.current = { state: "departing", startTime: performance.now() };
    }

    lastShipTickRef.current = lastShipTick;
  }, [city?.tradeStats, city?.totalTicks]);

  // Animation loop for ship bob + arrival/departure lerp
  useEffect(() => {
    const animate = () => {
      const ship = shipGroupRef.current;
      if (!ship) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const now = performance.now();
      const anim = animRef.current;
      const elapsed = now - anim.startTime;

      switch (anim.state) {
        case "arriving": {
          const t = Math.min(elapsed / ARRIVAL_DURATION, 1);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          ship.position.lerpVectors(SHIP_OFFSCREEN_POSITION, SHIP_DOCK_POSITION, eased);
          ship.visible = true;
          // Bob while arriving
          ship.position.y = SHIP_DOCK_POSITION.y + Math.sin(now / 800) * 0.4;
          if (t >= 1) {
            animRef.current = { state: "docked", startTime: now };
          }
          break;
        }
        case "docked": {
          ship.visible = true;
          ship.position.x = SHIP_DOCK_POSITION.x;
          ship.position.z = SHIP_DOCK_POSITION.z;
          // Gentle bob
          ship.position.y = SHIP_DOCK_POSITION.y + Math.sin(now / 1000) * 0.3;
          // Slight roll
          ship.rotation.z = Math.sin(now / 1200) * 0.02;
          break;
        }
        case "departing": {
          const t = Math.min(elapsed / DEPARTURE_DURATION, 1);
          const eased = t * t; // ease-in quadratic
          ship.position.lerpVectors(SHIP_DOCK_POSITION, SHIP_OFFSCREEN_POSITION, eased);
          ship.position.y = SHIP_DOCK_POSITION.y + Math.sin(now / 800) * 0.4;
          ship.visible = true;
          if (t >= 1) {
            animRef.current = { state: "hidden", startTime: now };
            ship.visible = false;
          }
          break;
        }
        case "hidden":
        default:
          ship.visible = false;
          break;
      }

      useWorldStore.getState().layer?.repaint();
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
