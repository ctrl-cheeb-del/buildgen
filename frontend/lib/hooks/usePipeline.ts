"use client";

import { useState, useCallback } from "react";
import type { MultiViewImages, PipelineStatus, WorldBuilding } from "../types";
import { loadProceduralGeometry } from "../viewer/procedural-loader";
import { useWorldStore } from "../stores/world-store";

interface PipelineState {
  isRunning: boolean;
  multiView: MultiViewImages | null;
  steps: Record<string, PipelineStatus>;
}

export function usePipeline() {
  const [state, setState] = useState<PipelineState>({
    isRunning: false,
    multiView: null,
    steps: {
      multiview: { step: "multiview", state: "idle" },
      generate: { step: "generate", state: "idle" },
      render: { step: "render", state: "idle" },
    },
  });

  const { addBuilding, generateId } = useWorldStore();

  const setStep = useCallback(
    (step: string, s: "idle" | "running" | "done" | "error", detail?: string) => {
      setState((prev) => ({
        ...prev,
        steps: {
          ...prev.steps,
          [step]: { step: step as PipelineStatus["step"], state: s, detail },
        },
      }));
    },
    []
  );

  const resetSteps = useCallback(() => {
    setState((prev) => ({
      ...prev,
      steps: {
        multiview: { step: "multiview", state: "idle" },
        generate: { step: "generate", state: "idle" },
        render: { step: "render", state: "idle" },
      },
    }));
  }, []);

  const runPipeline = useCallback(
    async (buildingName: string, lng: number, lat: number) => {
      if (!buildingName.trim()) return;

      setState((prev) => ({
        ...prev,
        isRunning: true,
        multiView: null,
      }));
      resetSteps();

      try {
        // Step 1: Multi-view generation via nanobanana
        setStep("multiview", "running", "Generating views...");

        const mvRes = await fetch("/api/pipeline/multiview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buildingName }),
        });

        if (!mvRes.ok) {
          const err = await mvRes.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || `Multi-view failed: ${mvRes.status}`);
        }

        const { views } = (await mvRes.json()) as { views: MultiViewImages };
        setState((prev) => ({ ...prev, multiView: views }));
        setStep("multiview", "done", "Views ready");

        // Step 2: Geometry generation via Mistral Codestral
        setStep("generate", "running", "Generating 3D code...");

        const geoRes = await fetch("/api/pipeline/geometry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buildingName, views }),
        });

        if (!geoRes.ok) {
          const err = await geoRes.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || `Geometry gen failed: ${geoRes.status}`);
        }

        const { code } = (await geoRes.json()) as { code: string };
        setStep("generate", "done", "Code generated");

        // Step 3: Render client-side
        setStep("render", "running", "Loading geometry...");

        const group = loadProceduralGeometry(code);
        const building: WorldBuilding = {
          id: generateId(),
          name: buildingName,
          lng,
          lat,
          path: "A",
          scale: 1,
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          visible: true,
          proceduralCode: code,
        };
        addBuilding(building, group);

        setStep("render", "done", "Rendered");
      } catch (err) {
        console.error("[Pipeline] Error:", err);
        // Mark the first running step as errored
        setState((prev) => {
          const newSteps = { ...prev.steps };
          for (const key of Object.keys(newSteps)) {
            if (newSteps[key].state === "running") {
              newSteps[key] = {
                ...newSteps[key],
                state: "error",
                detail: err instanceof Error ? err.message : String(err),
              };
              break;
            }
          }
          return { ...prev, steps: newSteps };
        });
      } finally {
        setState((prev) => ({ ...prev, isRunning: false }));
      }
    },
    [addBuilding, generateId, resetSteps, setStep]
  );

  return {
    ...state,
    runPipeline,
  };
}
