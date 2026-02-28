"use client";

import { useEffect, useRef } from "react";
import type { PlaneKeys } from "../plane/plane-physics";
import { usePlaneStore } from "../stores/plane-store";

export function usePlaneKeys(): React.RefObject<PlaneKeys> {
  const keys = useRef<PlaneKeys>({
    w: false, a: false, s: false, d: false,
    space: false, shift: false,
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!usePlaneStore.getState().planeMode) return;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        e.preventDefault();
        keys.current[k] = true;
      }
      if (e.code === "Space") {
        e.preventDefault();
        keys.current.space = true;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        e.preventDefault();
        keys.current.shift = true;
      }
      if (k === "escape") {
        usePlaneStore.getState().setPlaneMode(false);
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
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        keys.current.shift = false;
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
