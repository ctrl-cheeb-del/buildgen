"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildGroundPlanes, disposeGroundPlanes } from "@/lib/viewer/ground-planes";
import { createEnvironmentMap } from "@/lib/viewer/environment";
import { createCloudDome } from "@/lib/viewer/clouds";
import { initTextureQuality, disposeTextureCache } from "@/lib/viewer/texture-loader";
import { useWorldStore } from "@/lib/stores/world-store";
import type { SceneLayer } from "@/lib/viewer/scene-layer";

/**
 * Adaptive quality: measures FPS over first N frames.
 * Auto-disables expensive features if FPS drops below thresholds.
 * Inspired by Levelsio's fly.pieter.com — shadows alone cost +57% GPU.
 */
class AdaptiveQuality {
  private frameTimes: number[] = [];
  private settled = false;
  private readonly SAMPLE_FRAMES = 90; // ~1.5s at 60fps
  private renderer: THREE.WebGLRenderer;
  private sun: THREE.DirectionalLight;

  constructor(renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight) {
    this.renderer = renderer;
    this.sun = sun;
  }

  sample(dt: number) {
    if (this.settled) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < this.SAMPLE_FRAMES) return;

    // Calculate average FPS (skip first 10 frames — init spike)
    const relevant = this.frameTimes.slice(10);
    const avgDt = relevant.reduce((a, b) => a + b, 0) / relevant.length;
    const avgFPS = 1 / avgDt;

    if (avgFPS < 30) {
      // Disable shadows (biggest GPU win — +57% in Levelsio's tests)
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      console.log(`[Perf] Shadows disabled (avg ${avgFPS.toFixed(0)} FPS)`);
    }

    if (avgFPS < 20) {
      // Reduce pixel ratio for extreme cases
      this.renderer.setPixelRatio(1);
      console.log(`[Perf] Pixel ratio reduced to 1 (avg ${avgFPS.toFixed(0)} FPS)`);
    }

    this.settled = true;
  }
}

export default function ThreeMapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<SceneLayer | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const setLayer = useWorldStore((s) => s.setLayer);

  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container || layerRef.current) return;

    // ── Renderer ──────────────────────────────────────────────
    // preserveDrawingBuffer: false (default) — enables GPU double-buffering
    // which is significantly faster than true. Screenshots use a separate
    // canvas if needed.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    initTextureQuality(renderer);

    // ── Scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xddeeff, 0.0008);

    const envMap = createEnvironmentMap(renderer);
    scene.environment = envMap;
    scene.background = envMap;

    const clouds = createCloudDome();
    scene.add(clouds.mesh);
    const clock = new THREE.Clock();

    // ── Lighting ──────────────────────────────────────────────
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.6);
    scene.add(hemi);

    // Key light (sun) — warm white, with shadows
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
    sun.position.set(500, 800, 400);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -800;
    sun.shadow.camera.right = 800;
    sun.shadow.camera.top = 800;
    sun.shadow.camera.bottom = -800;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1800;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.target.position.set(0, 0, 0);
    scene.add(sun);
    scene.add(sun.target);

    // Fill light — cooler, opposite side (no shadows = cheap)
    const fill = new THREE.DirectionalLight(0xc4d7ff, 0.4);
    fill.position.set(-100, 150, -50);
    scene.add(fill);

    // Rim light (no shadows = cheap)
    const rim = new THREE.DirectionalLight(0xffeedd, 0.25);
    rim.position.set(0, -100, 100);
    scene.add(rim);

    // ── Ground planes (merged geometry, shared materials) ─────
    const groundGroup = buildGroundPlanes();
    scene.add(groundGroup);

    // ── Camera ────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      1,
      5000
    );
    camera.position.set(-200, 650, 700);

    // ── OrbitControls (Sims/Mapbox-style) ──────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minPolarAngle = 0.1;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 3000;
    controls.panSpeed = 1.5;

    // Left-drag = pan, right-drag = rotate, scroll = zoom (map-like)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    // Touch: one finger = pan, two fingers = pinch-zoom + rotate
    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    // Pan along world XZ plane (not screen-space)
    controls.screenSpacePanning = false;

    // Arrow keys to pan
    controls.listenToKeyEvents(window);
    controls.update();

    // ── Adaptive quality ─────────────────────────────────────
    const quality = new AdaptiveQuality(renderer, sun);

    // ── Render-on-demand (dirty flag) ────────────────────────
    // Only render when something changes. GPU drops to ~zero when idle.
    // Clouds tick every 2s to keep drifting.
    let dirty = true;
    let animId = 0;
    let lastCloudTick = 0;

    function markDirty() {
      dirty = true;
    }

    controls.addEventListener("change", markDirty);

    function animate() {
      animId = requestAnimationFrame(animate);

      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Adaptive quality sampling (first ~90 frames)
      quality.sample(dt);

      // Damping needs update() every frame when active
      // Skip when disabled (car mode owns the camera)
      const controlsUpdated = controls.enabled ? controls.update() : false;

      // Cloud drift: update every 2s (cheap tick, triggers repaint)
      if (elapsed - lastCloudTick > 2) {
        lastCloudTick = elapsed;
        clouds.update(elapsed, camera);
        dirty = true;
      }

      if (dirty || controlsUpdated) {
        renderer.render(scene, camera);
        dirty = false;
      }
    }
    animate();

    // ── Resize (ResizeObserver for layout changes) ────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      dirty = true;
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // ── SceneLayer interface ──────────────────────────────────
    const layer: SceneLayer = {
      addGroup(group: THREE.Group) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            for (const m of mats) {
              if (!m) continue;
              if (m.transparent) {
                m.depthWrite = false;
                m.polygonOffset = true;
                m.polygonOffsetFactor = -1;
                m.polygonOffsetUnits = -1;
              }
            }
          }
        });
        scene.add(group);
        markDirty();
      },
      removeGroup(group: THREE.Group) {
        scene.remove(group);
        markDirty();
      },
      repaint: markDirty,
      getScene: () => scene,
      getCamera: () => camera,
      getCanvas: () => renderer.domElement,
      setControlsEnabled(enabled: boolean) {
        controls.enabled = enabled;
      },
    };

    layerRef.current = layer;
    setLayer(layer);

    // ── Cleanup ───────────────────────────────────────────────
    cleanupRef.current = () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animId);
      controls.removeEventListener("change", markDirty);
      controls.dispose();
      clouds.dispose();
      disposeGroundPlanes(groundGroup);

      // Dispose env map (PMREM texture)
      envMap.dispose();
      scene.environment = null;
      scene.background = null;

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      scene.clear();
      renderer.dispose();
      disposeTextureCache();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      layerRef.current = null;
    };
  }, [setLayer]);

  useEffect(() => {
    initScene();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [initScene]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
