import * as THREE from "three";

/**
 * Abstraction over the Three.js scene for the map view.
 * Replaces the old ThreeJSMapboxLayer interface.
 * All coordinates are in meter-space (no Mercator projection).
 */
export interface SceneLayer {
  addGroup(group: THREE.Group): void;
  removeGroup(group: THREE.Group): void;
  repaint(): void;
  getScene(): THREE.Scene;
  getCamera(): THREE.Camera;
  getCanvas(): HTMLCanvasElement;
  /** Enable/disable OrbitControls (used by car mode) */
  setControlsEnabled(enabled: boolean): void;
  /** Smooth camera fly to a world-space XZ position */
  flyTo(x: number, z: number, duration?: number): void;
}
