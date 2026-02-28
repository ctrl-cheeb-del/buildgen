"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { FirstPersonController } from "../../lib/fp/fp-controller";
import {
  buildFPScene,
  getSpawnPosition,
  type BuildingData,
} from "../../lib/fp/fp-scene-builder";
import { useFPStore } from "../../lib/stores/fp-store";
import { useFPKeys } from "../../lib/hooks/useFPKeys";
import FPHud from "./FPHud";

interface FirstPersonOverlayProps {
  buildings: BuildingData[];
}

export default function FirstPersonOverlay({
  buildings,
}: FirstPersonOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<FirstPersonController | null>(null);
  const sceneResultRef = useRef<ReturnType<typeof buildFPScene> | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number>(0);

  const character = useFPStore((s) => s.character);
  const setFPMode = useFPStore((s) => s.setFPMode);
  const keys = useFPKeys();

  const [isLocked, setIsLocked] = useState(false);

  const handleExit = useCallback(() => {
    setFPMode(false);
  }, [setFPMode]);

  // ESC handling: first ESC unlocks pointer (browser default),
  // second ESC exits FP mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !controllerRef.current?.isLocked) {
        handleExit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleExit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    const spawn = getSpawnPosition();
    camera.position.copy(spawn);
    cameraRef.current = camera;

    // Scene
    const sceneResult = buildFPScene(renderer, buildings);
    sceneResultRef.current = sceneResult;

    // Controller
    const controller = new FirstPersonController(camera, canvas);
    controllerRef.current = controller;

    controller.controls.addEventListener("lock", () => setIsLocked(true));
    controller.controls.addEventListener("unlock", () => setIsLocked(false));

    // Animation loop
    const clock = new THREE.Clock();
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1); // cap delta

      controller.update(delta, keys.current);
      controller.resolveCollisions(sceneResult.colliders);
      controller.clampToBounds(sceneResult.bounds);

      sceneResult.update(clock.getElapsedTime(), camera);
      renderer.render(sceneResult.scene, camera);
    }
    animate();

    // Resize
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animFrameRef.current);
      controller.dispose();
      sceneResult.dispose();
      renderer.dispose();
    };
  }, [buildings, keys]);

  const handleCanvasClick = useCallback(() => {
    controllerRef.current?.lock();
  }, []);

  return (
    <div className="fixed inset-0 z-40">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-full cursor-pointer"
      />
      {character && (
        <FPHud
          handle={character.handle}
          avatarUrl={character.avatarUrl}
          isLocked={isLocked}
          onExit={handleExit}
        />
      )}
    </div>
  );
}
