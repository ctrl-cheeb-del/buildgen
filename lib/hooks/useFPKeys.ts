"use client";

import { useEffect, useRef } from "react";
import { useFPStore } from "../stores/fp-store";

export interface FPKeys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  shift: boolean;
  space: boolean;
}

export function useFPKeys(): React.RefObject<FPKeys> {
  const keys = useRef<FPKeys>({ w: false, a: false, s: false, d: false, shift: false, space: false });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!useFPStore.getState().fpMode) return;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        e.preventDefault();
        keys.current[k] = true;
      }
      if (e.key === "Shift") {
        keys.current.shift = true;
      }
      if (e.code === "Space") {
        e.preventDefault();
        keys.current.space = true;
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        keys.current[k] = false;
      }
      if (e.key === "Shift") {
        keys.current.shift = false;
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
