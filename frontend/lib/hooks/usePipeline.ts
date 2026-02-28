"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { MultiViewImages, PipelineStatus, WorldBuilding } from "../types";
import { loadProceduralGeometry } from "../viewer/procedural-loader";
import { useWorldStore } from "../stores/world-store";

interface PipelineState {
  isRunning: boolean;
  multiView: MultiViewImages | null;
  steps: Record<string, PipelineStatus>;
}

async function base64ToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function uploadToConvex(
  generateUploadUrl: () => Promise<string>,
  blob: Blob
): Promise<string> {
  const url = await generateUploadUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const { storageId } = await res.json();
  return storageId;
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
  const generateUploadUrl = useMutation(api.multiViewPreviews.generateUploadUrl);
  const savePreview = useMutation(api.multiViewPreviews.save);

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
    async (
      buildingName: string,
      lng: number,
      lat: number,
      cachedViews?: MultiViewImages
    ) => {
      if (!buildingName.trim()) return;

      setState((prev) => ({
        ...prev,
        isRunning: true,
        multiView: null,
      }));
      resetSteps();

      try {
        let views: MultiViewImages;

        if (cachedViews) {
          // Reuse cached views — skip generation entirely
          views = cachedViews;
          setState((prev) => ({ ...prev, multiView: views }));
          setStep("multiview", "done", "Using cached preview");
        } else {
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

          const mvData = (await mvRes.json()) as { views: MultiViewImages };
          views = mvData.views;
          setState((prev) => ({ ...prev, multiView: views }));
          setStep("multiview", "done", "Views ready");

          // Upload to Convex file storage and swap base64 for HTTP URLs
          if (views.front.startsWith("data:")) {
            setStep("multiview", "done", "Saving to cache...");
            try {
              const [frontBlob, rightBlob, backBlob, leftBlob, gridBlob] =
                await Promise.all([
                  base64ToBlob(views.front),
                  base64ToBlob(views.right),
                  base64ToBlob(views.back),
                  base64ToBlob(views.left),
                  views.gridUrl
                    ? base64ToBlob(views.gridUrl)
                    : base64ToBlob(views.front),
                ]);

              console.log("[Pipeline] Uploading 5 images to Convex...");
              const [frontId, rightId, backId, leftId, gridId] =
                await Promise.all([
                  uploadToConvex(generateUploadUrl, frontBlob),
                  uploadToConvex(generateUploadUrl, rightBlob),
                  uploadToConvex(generateUploadUrl, backBlob),
                  uploadToConvex(generateUploadUrl, leftBlob),
                  uploadToConvex(generateUploadUrl, gridBlob),
                ]);
              console.log("[Pipeline] Uploads done, saving preview record...");

              const result = await savePreview({
                buildingName,
                frontStorageId: frontId as any,
                rightStorageId: rightId as any,
                backStorageId: backId as any,
                leftStorageId: leftId as any,
                gridStorageId: gridId as any,
              });
              console.log("[Pipeline] Preview saved, URLs:", {
                front: result.front?.slice(0, 60),
                right: result.right?.slice(0, 60),
              });

              if (result.front && result.right && result.back && result.left) {
                views = {
                  front: result.front,
                  right: result.right,
                  back: result.back,
                  left: result.left,
                  gridUrl: result.gridUrl ?? undefined,
                };
                setState((prev) => ({ ...prev, multiView: views }));
                console.log("[Pipeline] Swapped base64 views for HTTP URLs");
              } else {
                console.warn("[Pipeline] Save returned null URLs, keeping base64");
              }

              setStep("multiview", "done", "Views ready (cached)");
            } catch (uploadErr) {
              console.error("[Pipeline] Cache upload failed:", uploadErr);
              setStep("multiview", "done", "Views ready (cache failed)");
            }
          }
        }

        // Step 2: Geometry generation via Mistral
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
    [addBuilding, generateId, resetSteps, setStep, generateUploadUrl, savePreview]
  );

  return {
    ...state,
    runPipeline,
  };
}
