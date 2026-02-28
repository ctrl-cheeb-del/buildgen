"use client";

import { useEffect, useRef } from "react";
import type { CarKeys } from "../car/car-physics";
import { useCarStore } from "../stores/car-store";

export function useCarKeys(): React.RefObject<CarKeys> {
  const keys = useRef<CarKeys>({ w: false, a: false, s: false, d: false, space: false });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!useCarStore.getState().carMode) return;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        e.preventDefault();
        keys.current[k] = true;
      }
      if (e.code === "Space") {
        e.preventDefault();
        keys.current.space = true;
      }
      if (k === "escape") {
        useCarStore.getState().setCarMode(false);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        keys.current[k] = false;
      }
      if (e.code === "Space") {
        keys.current.space = false;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return keys;
}
