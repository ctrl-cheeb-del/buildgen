import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CameraAngle } from "@/lib/types";
import { loadProceduralGeometry } from "./procedural-loader";

const CAMERA_ANGLES: Record<
  CameraAngle,
  (center: THREE.Vector3, dist: number) => THREE.Vector3
> = {
  front: (c, d) => new THREE.Vector3(c.x, c.y, c.z + d),
  right: (c, d) => new THREE.Vector3(c.x + d, c.y, c.z),
  back: (c, d) => new THREE.Vector3(c.x, c.y, c.z - d),
  left: (c, d) => new THREE.Vector3(c.x - d, c.y, c.z),
  top: (c, d) => new THREE.Vector3(c.x, c.y + d, c.z + 0.01),
  perspective: (c, d) =>
    new THREE.Vector3(c.x + d * 0.7, c.y + d * 0.5, c.z + d * 0.7),
};

export class WorkbenchRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private currentGroup: THREE.Group | null = null;
  private gridHelper: THREE.GridHelper;
  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true, // needed for screenshots
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a1a2e);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.camera.position.set(100, 80, 150);

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.set(0, 50, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(100, 200, 100);
    dir1.castShadow = true;
    this.scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-100, 150, -50);
    this.scene.add(dir2);

    const hemi = new THREE.HemisphereLight(0xb1e1ff, 0xb97a20, 0.3);
    this.scene.add(hemi);

    // Grid floor
    this.gridHelper = new THREE.GridHelper(200, 20, 0x444466, 0x333355);
    this.scene.add(this.gridHelper);

    this.startLoop();
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  loadCode(code: string) {
    // Remove previous model
    if (this.currentGroup) {
      this.scene.remove(this.currentGroup);
      this.currentGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    this.currentGroup = loadProceduralGeometry(code);
    this.scene.add(this.currentGroup);
    this.fitCamera();
  }

  fitCamera() {
    if (!this.currentGroup) return;

    // Ensure world matrices are up to date before computing bounds
    this.currentGroup.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.currentGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2;

    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + dist * 0.7,
      center.y + dist * 0.5,
      center.z + dist * 0.7
    );
    this.controls.update();
  }

  /**
   * After positioning the camera, project all 8 bounding box corners to
   * screen space and zoom out until the entire building fits with padding.
   * This correctly handles perspective distortion and any aspect ratio.
   */
  private ensureBBoxInView(box: THREE.Box3, fillRatio = 0.82) {
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();

    // Get all 8 corners of the bounding box
    const corners: THREE.Vector3[] = [];
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          corners.push(
            new THREE.Vector3(
              x ? box.max.x : box.min.x,
              y ? box.max.y : box.min.y,
              z ? box.max.z : box.min.z,
            )
          );
        }
      }
    }

    // Project corners to NDC space [-1, 1]
    let maxNDC = 0;
    for (const corner of corners) {
      const ndc = corner.clone().project(this.camera);
      maxNDC = Math.max(maxNDC, Math.abs(ndc.x), Math.abs(ndc.y));
    }

    // If any corner exceeds the desired fill, zoom out proportionally
    if (maxNDC > 0) {
      const scale = maxNDC / fillRatio;
      if (scale > 1) {
        const dir = new THREE.Vector3()
          .subVectors(this.camera.position, this.controls.target)
          .multiplyScalar(scale);
        this.camera.position.copy(this.controls.target).add(dir);
        this.controls.update();
      }
    }
  }

  setCameraAngle(angle: CameraAngle, forCapture = false) {
    if (!this.currentGroup) return;

    this.currentGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.currentGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Initial distance: rough estimate based on largest dimension
    const dist = maxDim * 1.5;

    const positionFn = CAMERA_ANGLES[angle];
    const pos = positionFn(center, dist);

    this.camera.position.copy(pos);
    this.controls.target.copy(center);
    this.controls.update();

    // For captures, project-and-verify to guarantee full building is in frame
    if (forCapture) {
      this.ensureBBoxInView(box, 0.82);
    }
  }

  captureScreenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/jpeg", 0.92);
  }

  captureAllViews(): Record<"front" | "right" | "back" | "left", string> {
    // Hide grid for clean captures
    this.gridHelper.visible = false;

    const views = {} as Record<"front" | "right" | "back" | "left", string>;
    for (const angle of ["front", "right", "back", "left"] as const) {
      this.setCameraAngle(angle, true);
      this.controls.update();
      views[angle] = this.captureScreenshot();
    }

    // Restore grid and return to perspective
    this.gridHelper.visible = true;
    this.setCameraAngle("perspective");
    return views;
  }

  dispose() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.controls.dispose();
    if (this.currentGroup) {
      this.scene.remove(this.currentGroup);
      this.currentGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }
    this.scene.clear();
    this.renderer.dispose();
  }

  private startLoop() {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }
}
