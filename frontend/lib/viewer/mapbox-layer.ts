import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { buildGroundPlanes, disposeGroundPlanes } from "./ground-planes";
import { createEnvironmentMap } from "./environment";
import { initTextureQuality } from "./texture-loader";

/**
 * Three.js custom layer for Mapbox GL JS.
 * Multi-group scene: each building is an independent THREE.Group
 * positioned by the world state manager.
 */
export class ThreeJSMapboxLayer implements mapboxgl.CustomLayerInterface {
  id: string;
  type: "custom" = "custom";
  renderingMode: "3d" = "3d";

  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private renderer!: THREE.WebGLRenderer;
  private map!: mapboxgl.Map;
  private groundGroup: THREE.Group | null = null;

  private modelOrigin: [number, number];
  private modelTransform!: {
    translateX: number;
    translateY: number;
    translateZ: number;
    rotateX: number;
    rotateY: number;
    rotateZ: number;
    scale: number;
  };

  constructor(id: string, lng: number, lat: number) {
    this.id = id;
    this.modelOrigin = [lng, lat];
    this.updateTransform(lng, lat);
  }

  private updateTransform(lng: number, lat: number) {
    const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
      [lng, lat],
      0
    );
    this.modelTransform = {
      translateX: modelAsMercatorCoordinate.x,
      translateY: modelAsMercatorCoordinate.y,
      translateZ: modelAsMercatorCoordinate.z!,
      rotateX: Math.PI / 2,
      rotateY: 0,
      rotateZ: 0,
      scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits(),
    };
  }

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.map = map;

    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    // Hemisphere light: warm sky + earth ground bounce (replaces flat white ambient)
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.6);
    this.scene.add(hemi);

    // Key light (sun) — warm white, with shadows
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
    sun.position.set(500, 800, 400);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.left = -800;
    sun.shadow.camera.right = 800;
    sun.shadow.camera.top = 800;
    sun.shadow.camera.bottom = -800;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1800;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.target.position.set(0, 0, 0);
    this.scene.add(sun);
    this.scene.add(sun.target);

    // Fill light — cooler, opposite side
    const fill = new THREE.DirectionalLight(0xc4d7ff, 0.4);
    fill.position.set(-100, 150, -50);
    this.scene.add(fill);

    // Rim light
    const rim = new THREE.DirectionalLight(0xffeedd, 0.25);
    rim.position.set(0, -100, 100);
    this.scene.add(rim);

    // Textured ground planes (roads, pavements, plots)
    this.groundGroup = buildGroundPlanes();
    this.scene.add(this.groundGroup);

    // Renderer: reuse Mapbox's GL context
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGL2RenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Enable anisotropic filtering for all textures
    initTextureQuality(this.renderer);

    // PMREM environment map — gives PBR materials realistic reflections
    this.scene.environment = createEnvironmentMap(this.renderer);
  }

  render(gl: WebGLRenderingContext, matrix: number[]) {
    const m = this.modelTransform;
    const rotationX = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(1, 0, 0),
      m.rotateX
    );
    const rotationY = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 1, 0),
      m.rotateY
    );
    const rotationZ = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 0, 1),
      m.rotateZ
    );

    const modelMatrix = new THREE.Matrix4()
      .makeTranslation(m.translateX, m.translateY, m.translateZ)
      .scale(new THREE.Vector3(m.scale, -m.scale, m.scale))
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);

    this.camera.projectionMatrix = new THREE.Matrix4()
      .fromArray(matrix)
      .multiply(modelMatrix);
    this.camera.projectionMatrixInverse
      .copy(this.camera.projectionMatrix)
      .invert();

    this.renderer.resetState();

    // Fix GL state for shared Mapbox context — ensure depth test works correctly
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    this.renderer.render(this.scene, this.camera);
  }

  onRemove() {
    if (this.groundGroup) {
      disposeGroundPlanes(this.groundGroup);
      this.groundGroup = null;
    }
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    this.scene.clear();
    this.renderer.dispose();
  }

  addGroup(group: THREE.Group) {
    // Force DoubleSide on all materials — the negative Y scale in the model
    // matrix inverts triangle winding, which culls front faces by default.
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.side = THREE.DoubleSide;
          });
        } else if (child.material) {
          child.material.side = THREE.DoubleSide;
        }
      }
    });
    this.scene.add(group);
    this.map?.triggerRepaint();
  }

  removeGroup(group: THREE.Group) {
    this.scene.remove(group);
    this.map?.triggerRepaint();
  }

  getMeterScale(): number {
    return this.modelTransform.scale;
  }

  repaint() {
    this.map?.triggerRepaint();
  }

  getOrigin(): [number, number] {
    return this.modelOrigin;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }

  getMap(): mapboxgl.Map {
    return this.map;
  }
}
