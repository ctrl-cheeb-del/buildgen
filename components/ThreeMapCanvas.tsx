"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildGroundPlanes, disposeGroundPlanes } from "@/lib/viewer/ground-planes";
import { createEnvironmentMap } from "@/lib/viewer/environment";
import { createCloudDome } from "@/lib/viewer/clouds";
import { createOcean } from "@/lib/viewer/ocean";
import { initTextureQuality, disposeTextureCache } from "@/lib/viewer/texture-loader";
import { useWorldStore } from "@/lib/stores/world-store";
import { updateShadowCulling } from "@/lib/viewer/shadow-culling";
import { updateVisibilityCulling } from "@/lib/viewer/visibility-culling";
import { getActiveNPCManager } from "@/lib/npc/npc-manager";
import type { SceneLayer } from "@/lib/viewer/scene-layer";

/**
 * Progressive quality degradation — monitors rolling FPS and steps down
 * through quality tiers one at a time to avoid over-correction.
 *
 * L0 (High)   : Everything on
 * L1 (Medium) : Fog tightened (reduces overdraw on distant buildings)
 * L2 (Low)    : Shadows disabled
 * L3 (Potato) : Pixel ratio → 1
 * L4 (Survive): Distance culling at 800m
 */
class AdaptiveQuality {
  private frameTimes: number[];
  private frameIndex = 0;
  private frameCount = 0;
  private readonly WINDOW = 60;
  private renderer: THREE.WebGLRenderer;
  private sun: THREE.DirectionalLight;
  private scene: THREE.Scene;
  private level = 0;
  renderDistance = Infinity;

  constructor(
    renderer: THREE.WebGLRenderer,
    sun: THREE.DirectionalLight,
    scene: THREE.Scene
  ) {
    this.renderer = renderer;
    this.sun = sun;
    this.scene = scene;
    this.frameTimes = new Array(this.WINDOW).fill(0);
  }

  sample(dt: number) {
    this.frameTimes[this.frameIndex] = dt;
    this.frameIndex = (this.frameIndex + 1) % this.WINDOW;
    this.frameCount++;

    if (this.frameCount < this.WINDOW || this.frameCount % this.WINDOW !== 0)
      return;

    const avgDt = this.frameTimes.reduce((a, b) => a + b, 0) / this.WINDOW;
    const avgFPS = 1 / avgDt;

    // One step per evaluation cycle to avoid over-correction
    if (this.level === 0 && avgFPS < 45) {
      this.level = 1;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.density = 0.0015;
      }
      console.log(`[Perf] L1: Fog tightened (avg ${avgFPS.toFixed(0)} FPS)`);
    } else if (this.level === 1 && avgFPS < 35) {
      this.level = 2;
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      console.log(`[Perf] L2: Shadows disabled (avg ${avgFPS.toFixed(0)} FPS)`);
    } else if (this.level === 2 && avgFPS < 25) {
      this.level = 3;
      if (this.renderer.getPixelRatio() > 1) {
        this.renderer.setPixelRatio(1);
      }
      console.log(`[Perf] L3: Pixel ratio → 1 (avg ${avgFPS.toFixed(0)} FPS)`);
    } else if (this.level === 3 && avgFPS < 18) {
      this.level = 4;
      this.renderDistance = 800;
      console.log(
        `[Perf] L4: Distance culling at 800m (avg ${avgFPS.toFixed(0)} FPS)`
      );
    }
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    initTextureQuality(renderer);

    // ── Scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x6ba3d6, 0.00018);

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
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.left = -600;
    sun.shadow.camera.right = 600;
    sun.shadow.camera.top = 750;
    sun.shadow.camera.bottom = -650;
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

    // ── Ocean (infinite water around city edges) ───────────────
    const ocean = createOcean();
    scene.add(ocean.mesh);

    // ── Camera ────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      2,
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

    // ── WASD camera pan ───────────────────────────────────────
    const keysDown = new Set<string>();
    const PAN_SPEED = 400; // meters per second

    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        keysDown.add(k);
        e.preventDefault();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keysDown.delete(e.key.toLowerCase());
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── Adaptive quality ─────────────────────────────────────
    const quality = new AdaptiveQuality(renderer, sun, scene);

    // ── Render-on-demand (dirty flag) ────────────────────────
    // Only render when something changes. GPU drops to ~zero when idle.
    // Clouds tick every 2s to keep drifting.
    let dirty = true;
    let animId = 0;
    let lastCloudTick = 0;
    let frameNum = 0;

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

      // WASD pan — move camera + target along camera-relative XZ plane
      if (keysDown.size > 0 && controls.enabled) {
        const dist = PAN_SPEED * dt;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

        const offset = new THREE.Vector3();
        if (keysDown.has("w")) offset.add(forward.clone().multiplyScalar(dist));
        if (keysDown.has("s")) offset.add(forward.clone().multiplyScalar(-dist));
        if (keysDown.has("a")) offset.add(right.clone().multiplyScalar(-dist));
        if (keysDown.has("d")) offset.add(right.clone().multiplyScalar(dist));

        camera.position.add(offset);
        controls.target.add(offset);
        dirty = true;
      }

      // NPC traffic tick (cars + pedestrians movement)
      const npcMgr = getActiveNPCManager();
      if (npcMgr && npcMgr.tick(dt)) {
        dirty = true;
      }

      // Ocean + cloud animation: throttle to ~30fps to preserve on-demand rendering
      if (elapsed - lastCloudTick > 1 / 30) {
        lastCloudTick = elapsed;
        ocean.update(elapsed);
        clouds.update(elapsed, camera);
        dirty = true;
      }

      // Distance culling — every 30 frames, hide buildings beyond render distance
      if (quality.renderDistance < Infinity && frameNum % 30 === 0) {
        const { containers } = useWorldStore.getState();
        const cx = camera.position.x, cz = camera.position.z;
        const maxDist2 = quality.renderDistance * quality.renderDistance;
        for (const container of containers.values()) {
          const dx = container.position.x - cx;
          const dz = container.position.z - cz;
          container.visible = dx * dx + dz * dz < maxDist2;
        }
        dirty = true;
      }
      frameNum++;

      if (dirty || controlsUpdated) {
        // Distance-based culling — skip shadows and hide far buildings
        const containers = useWorldStore.getState().containers;
        if (updateVisibilityCulling(containers, camera)) dirty = true;
        if (updateShadowCulling(containers, camera)) dirty = true;

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
      flyTo(x: number, z: number, duration = 1.2) {
        // Animate camera + controls target to center on (x, z)
        const startTarget = controls.target.clone();
        const startPos = camera.position.clone();
        // Offset: maintain same relative camera offset from target
        const offset = startPos.clone().sub(startTarget);
        // Bring camera closer for a nice zoom-in (cap at 400 height)
        const zoomOffset = offset.clone();
        if (zoomOffset.y > 400) {
          const scale = 400 / zoomOffset.y;
          zoomOffset.multiplyScalar(scale);
        }
        const endTarget = new THREE.Vector3(x, 0, z);
        const endPos = endTarget.clone().add(zoomOffset);

        const startTime = performance.now();
        const durationMs = duration * 1000;

        function easeInOut(t: number): number {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function tick() {
          const elapsed = performance.now() - startTime;
          const t = Math.min(elapsed / durationMs, 1);
          const e = easeInOut(t);

          controls.target.lerpVectors(startTarget, endTarget, e);
          camera.position.lerpVectors(startPos, endPos, e);
          controls.update();
          markDirty();

          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
    };

    layerRef.current = layer;
    setLayer(layer);

    // ── Cleanup ───────────────────────────────────────────────
    cleanupRef.current = () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      controls.removeEventListener("change", markDirty);
      controls.dispose();
      clouds.dispose();
      ocean.dispose();
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
