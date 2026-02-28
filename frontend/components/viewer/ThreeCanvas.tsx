"use client";

import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createFootprintOutline,
  createGridFloor,
  createAxesHelper,
  createViewerLights,
} from "@/lib/viewer/scene-helpers";
import {
  captureMultiAngle,
  type MultiAngleScreenshots,
} from "@/lib/viewer/screenshot";
import {
  computeGeometryStats,
  type GeometryStats,
} from "@/lib/viewer/geometry-stats";

export interface ThreeCanvasHandle {
  captureScreenshots: () => MultiAngleScreenshots | null;
  loadGroup: (group: THREE.Group) => GeometryStats | null;
  clear: () => void;
}

interface ThreeCanvasProps {
  onStatsUpdate?: (stats: GeometryStats | null) => void;
}

const ThreeCanvas = forwardRef<ThreeCanvasHandle, ThreeCanvasProps>(
  function ThreeCanvas({ onStatsUpdate }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const buildingRef = useRef<THREE.Group | null>(null);
    const animIdRef = useRef<number>(0);

    // Initialize Three.js scene
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.1,
        2000
      );
      camera.position.set(80, 80, 80);
      camera.lookAt(0, 40, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true, // needed for toDataURL
      });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 40, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.update();
      controlsRef.current = controls;

      // Scene furniture
      scene.add(createViewerLights());
      scene.add(createGridFloor());
      scene.add(createAxesHelper());
      scene.add(createFootprintOutline());

      // Animation loop
      function animate() {
        animIdRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // Resize handler
      const onResize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(animIdRef.current);
        controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    const clearBuilding = useCallback(() => {
      const scene = sceneRef.current;
      const old = buildingRef.current;
      if (scene && old) {
        scene.remove(old);
        old.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => m.dispose());
          }
        });
        buildingRef.current = null;
      }
      onStatsUpdate?.(null);
    }, [onStatsUpdate]);

    const loadGroup = useCallback(
      (group: THREE.Group): GeometryStats | null => {
        clearBuilding();
        const scene = sceneRef.current;
        if (!scene) return null;

        scene.add(group);
        buildingRef.current = group;

        const stats = computeGeometryStats(group);
        onStatsUpdate?.(stats);

        // Reframe camera to fit the building
        const controls = controlsRef.current;
        const camera = cameraRef.current;
        if (controls && camera) {
          const centerY = stats.dimensions.y / 2;
          controls.target.set(0, centerY, 0);
          const maxDim = Math.max(
            stats.dimensions.x,
            stats.dimensions.y,
            stats.dimensions.z
          );
          const dist = maxDim * 1.5;
          camera.position.set(dist, centerY + dist * 0.5, dist);
          controls.update();
        }

        return stats;
      },
      [clearBuilding, onStatsUpdate]
    );

    const captureScreenshots =
      useCallback((): MultiAngleScreenshots | null => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const building = buildingRef.current;
        if (!renderer || !scene || !camera || !building) return null;

        const stats = computeGeometryStats(building);
        const centerY = stats.dimensions.y / 2;
        const target = new THREE.Vector3(0, centerY, 0);
        const maxDim = Math.max(
          stats.dimensions.x,
          stats.dimensions.y,
          stats.dimensions.z
        );
        const distance = maxDim * 1.5;
        const height = maxDim * 0.3;

        return captureMultiAngle(
          renderer,
          scene,
          camera,
          target,
          distance,
          height
        );
      }, []);

    useImperativeHandle(
      ref,
      () => ({
        captureScreenshots,
        loadGroup,
        clear: clearBuilding,
      }),
      [captureScreenshots, loadGroup, clearBuilding]
    );

    return (
      <div
        ref={containerRef}
        className="w-full h-full bg-gray-900 rounded-lg overflow-hidden"
      />
    );
  }
);

export default ThreeCanvas;
