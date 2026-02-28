import * as THREE from "three";

/**
 * Generate a PMREM environment map from a procedural gradient sky.
 * Gives all PBR materials subtle reflections and realistic light interaction.
 *
 * Set the returned texture on `scene.environment` — Three.js will automatically
 * apply it to every MeshStandardMaterial / MeshPhysicalMaterial in the scene.
 */
export function createEnvironmentMap(
  renderer: THREE.WebGLRenderer
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);

  const scene = new THREE.Scene();

  // Hemisphere gradient sphere — simulates sky dome
  const geo = new THREE.SphereGeometry(100, 64, 32);
  const posAttr = geo.getAttribute("position");
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const zenith = new THREE.Color(0x0066dd); // deep blue overhead
  const horizon = new THREE.Color(0xddeeff); // pale blue-white horizon
  const nadir = new THREE.Color(0x443322); // warm dark ground

  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const y = posAttr.getY(i) / 100; // -1 to 1
    const t = y * 0.5 + 0.5; // 0 (bottom) to 1 (top)

    if (t > 0.5) {
      tmp.lerpColors(horizon, zenith, (t - 0.5) * 2);
    } else {
      tmp.lerpColors(nadir, horizon, t * 2);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(geo, skyMat));

  // Sun disc — creates a bright specular highlight on reflective surfaces
  const sunGeo = new THREE.CircleGeometry(10, 32);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xffffee,
    side: THREE.DoubleSide,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(40, 70, 50);
  sun.lookAt(0, 0, 0);
  scene.add(sun);

  const envMap = pmrem.fromScene(scene, 0, 0.1, 1000).texture;

  pmrem.dispose();
  geo.dispose();
  skyMat.dispose();
  sunGeo.dispose();
  sunMat.dispose();

  return envMap;
}
