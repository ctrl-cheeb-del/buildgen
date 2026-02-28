import * as THREE from "three";

/**
 * Evaluates a generated Three.js code string and returns a Group.
 * The code should be a function body that uses THREE and returns a THREE.Group.
 */
export function loadProceduralGeometry(code: string): THREE.Group {
  const forbidden = [
    "fetch(",
    "XMLHttpRequest",
    "localStorage",
    "sessionStorage",
    "navigator.",
    "import(",
    "require(",
    "eval(",
    "document.cookie",
    "sendBeacon",
  ];
  for (const keyword of forbidden) {
    if (code.includes(keyword)) {
      console.error(
        `[ProceduralLoader] Generated code contains forbidden keyword: ${keyword}`
      );
      return createFallbackGroup();
    }
  }

  try {
    const fn = new Function("THREE", `"use strict";\n${code}`);
    const result = fn(THREE);

    if (result instanceof THREE.Group) {
      return result;
    }

    if (result instanceof THREE.Object3D) {
      const group = new THREE.Group();
      group.add(result);
      return group;
    }

    console.warn("[ProceduralLoader] Code did not return a THREE.Object3D");
    return createFallbackGroup();
  } catch (err) {
    console.error("[ProceduralLoader] Failed to execute generated code:", err);
    return createFallbackGroup();
  }
}

function createFallbackGroup(): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(20, 50, 20);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xff4444,
    roughness: 0.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 25;
  group.add(mesh);
  return group;
}
