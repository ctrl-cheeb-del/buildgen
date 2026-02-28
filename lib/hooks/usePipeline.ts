"use client";

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePipelineStore } from "../stores/pipeline-store";

interface PipelineState {
  isRunning: boolean;
  error: string | null;
}

export function usePipeline() {
  const [state, setState] = useState<PipelineState>({
    isRunning: false,
    error: null,
  });

  const generateBuilding = useAction(api.pipeline.generateBuilding);

  const runPipeline = useCallback(
    async (buildingName: string, plotIndex: number) => {
      if (!buildingName.trim()) return;

      // Reset pipeline store — clears old iteration data, scores, node statuses
      usePipelineStore.getState().reset();
      setState({ isRunning: true, error: null });

      try {
        await generateBuilding({ plotIndex, buildingName });
      } catch (err) {
        console.error("[Pipeline] Error:", err);
        setState({
          isRunning: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      setState({ isRunning: false, error: null });
    },
    [generateBuilding]
  );

  return {
    isRunning: state.isRunning,
    error: state.error,
    runPipeline,
  };
}
