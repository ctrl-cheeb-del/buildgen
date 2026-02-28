"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type {
  WorkbenchScreenshots,
  IterationResult,
  ScoreBreakdown,
} from "@/lib/types";
import type { Id } from "../../convex/_generated/dataModel";
import { usePipelineStore } from "../stores/pipeline-store";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type IterationStep =
  | "idle"
  | "capturing"
  | "scoring"
  | "improving"
  | "updating";

interface IterationState {
  buildingId: string | null;
  iterations: IterationResult[];
  currentCode: string;
  isIterating: boolean;
  isPaused: boolean;
  currentStep: IterationStep;
  maxIterations: number;
  error: string | null;
}

interface StartSessionOpts {
  sessionId: string;
  buildingId: string;
  initialCode: string;
  captureScreenshots: (code: string) => WorkbenchScreenshots;
  maxIterations?: number;
  qualityTarget?: number;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                                */
/* ------------------------------------------------------------------ */

export function useIteration() {
  const [state, setState] = useState<IterationState>({
    buildingId: null,
    iterations: [],
    currentCode: "",
    isIterating: false,
    isPaused: false,
    currentStep: "idle",
    maxIterations: 3000,
    error: null,
  });

  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const isRunningRef = useRef(false);
  const maxIterRef = useRef(3000);
  const updateBuildingCode = useMutation(api.buildings.updateProceduralCode);

  const setMaxIterations = useCallback((n: number) => {
    maxIterRef.current = n;
    setState((prev) => ({ ...prev, maxIterations: n }));
  }, []);

  /** Start the auto-iteration loop using an existing session */
  const startSession = useCallback(
    async (opts: StartSessionOpts) => {
      if (isRunningRef.current) return; // prevent concurrent runs
      isRunningRef.current = true;
      stopRef.current = false;
      pauseRef.current = false;

      const store = usePipelineStore.getState();
      store.setActive(true);

      // Override max iterations if provided by orchestrator
      if (opts.maxIterations != null) {
        maxIterRef.current = opts.maxIterations;
        setState((prev) => ({ ...prev, maxIterations: opts.maxIterations! }));
        store.setMaxIterations(opts.maxIterations);
      }

      const qualityTarget = opts.qualityTarget ?? 8.0;

      setState((prev) => ({
        ...prev,
        buildingId: opts.buildingId,
        currentCode: opts.initialCode,
        iterations: [],
        isIterating: true,
        isPaused: false,
        currentStep: "idle",
        error: null,
      }));

      try {
        const { sessionId } = opts;

        // Run iteration loop
        let code = opts.initialCode;
        let iterations: IterationResult[] = [];
        let consecutiveDrops = 0;

        for (let i = 0; i < maxIterRef.current; i++) {
          if (stopRef.current) break;

          // Wait if paused
          while (pauseRef.current && !stopRef.current) {
            await new Promise((r) => setTimeout(r, 200));
          }
          if (stopRef.current) break;

          try {
            // Step 1: Capture screenshots
            setState((prev) => ({ ...prev, currentStep: "capturing" }));
            store.setNodeStatus("capture", "active", `Iteration ${i + 1}`);
            const screenshots = opts.captureScreenshots(code);
            store.setCurrentScreenshots(screenshots);
            store.setNodeStatus("capture", "done");

            // Step 2: Score via Bedrock
            setState((prev) => ({ ...prev, currentStep: "scoring" }));
            store.setNodeStatus("score", "active", "Scoring...");

            const stepRes = await fetch("/api/iterate/step", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId,
                renderScreenshots: screenshots,
                currentCode: code,
              }),
            });

            if (!stepRes.ok) {
              const err = await stepRes
                .json()
                .catch(() => ({ error: "Unknown" }));
              throw new Error(
                err.error || `Iteration step failed: ${stepRes.status}`
              );
            }

            const data = (await stepRes.json()) as {
              score: ScoreBreakdown;
              improvedCode: string | null;
              converged: boolean;
              feedback: string;
            };

            store.setNodeStatus("score", "done");

            // Step 3: Improving — apply improved code
            setState((prev) => ({ ...prev, currentStep: "improving" }));
            store.setNodeStatus("improve", "active", "Applying improvements...");

            const prevScore =
              iterations.length > 0
                ? iterations[iterations.length - 1].score.totalScore
                : 0;

            const improved = data.score.totalScore > prevScore;

            if (data.score.totalScore < prevScore) {
              consecutiveDrops++;
            } else {
              consecutiveDrops = 0;
            }

            const newCode = data.improvedCode || code;

            const iterResult: IterationResult = {
              iteration: iterations.length + 1,
              score: data.score,
              feedback: data.feedback,
              feedbackPrompt: "",
              code: newCode,
              screenshots,
              improved,
            };

            iterations = [...iterations, iterResult];
            code = newCode;

            store.setNodeStatus("improve", "done");

            // Step 4: Update building in Convex
            setState((prev) => ({ ...prev, currentStep: "updating" }));
            store.setNodeStatus("update", "active", "Saving to map...");

            await updateBuildingCode({
              buildingId: opts.buildingId as Id<"buildings">,
              proceduralCode: newCode,
            });

            store.setNodeStatus("update", "done");

            // Update state + pipeline store
            setState((prev) => ({
              ...prev,
              iterations,
              currentCode: code,
            }));

            const latestScore = iterations[iterations.length - 1]?.score ?? null;
            store.setIterationData(iterations.length, latestScore, iterations);

            // Stop conditions
            if (data.converged || data.score.totalScore >= qualityTarget) {
              console.log(`[Iteration] Converged (score ${data.score.totalScore} >= target ${qualityTarget}) — stopping`);
              break;
            }

            if (!data.improvedCode) {
              console.log("[Iteration] No improved code returned — stopping");
              break;
            }

            if (consecutiveDrops >= 2) {
              console.log(
                "[Iteration] 2 consecutive drops — reverting to best"
              );
              const best = iterations.reduce((a, b) =>
                a.score.totalScore >= b.score.totalScore ? a : b
              );
              code = best.code;

              await updateBuildingCode({
                buildingId: opts.buildingId as Id<"buildings">,
                proceduralCode: best.code,
              });

              setState((prev) => ({ ...prev, currentCode: best.code }));
              break;
            }

            // If "pause after next" was toggled during this iteration
            if (pauseRef.current) {
              setState((prev) => ({ ...prev, isPaused: true }));
              store.setPaused(true);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setState((prev) => ({ ...prev, error: msg }));
            store.setError(msg);
            const activeNode = usePipelineStore.getState().nodes.find((n) => n.status === "active");
            if (activeNode) store.setNodeStatus(activeNode.id, "error", msg);
            break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, error: msg }));
        usePipelineStore.getState().setError(msg);
      } finally {
        isRunningRef.current = false;
        usePipelineStore.getState().setActive(false);
        setState((prev) => ({
          ...prev,
          isIterating: false,
          currentStep: "idle",
        }));
      }
    },
    [updateBuildingCode]
  );

  const stop = useCallback(() => {
    stopRef.current = true;
    pauseRef.current = false;
    usePipelineStore.getState().setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    pauseRef.current = !pauseRef.current;
    setState((prev) => ({ ...prev, isPaused: pauseRef.current }));
    usePipelineStore.getState().setPaused(pauseRef.current);
  }, []);

  return {
    ...state,
    startSession,
    stop,
    togglePause,
    setMaxIterations,
  };
}
