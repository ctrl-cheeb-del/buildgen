import * as THREE from "three";
import mapboxgl from "mapbox-gl";

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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(100, 200, 100);
    this.scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-100, 150, -50);
    this.scene.add(directionalLight2);

    // Renderer: reuse Mapbox's GL context
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGL2RenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;
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

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  onRemove() {
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
}
