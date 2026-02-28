import * as THREE from "three";
import {
  PLOT_SIZE_M,
  PAVEMENT_WIDTH_M,
} from "../grid/grid-constants";

/** Maximum footprint a building can occupy (inner plot minus margin) */
const MAX_FOOTPRINT = PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M; // 24m

/**
 * Normalize a group so its XZ footprint fits within MAX_FOOTPRINT and
 * the model is centered on X/Z with its base at Y=0.
 */
function normalizeToPlot(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Scale uniformly so the largest horizontal dimension fits the plot
  const maxHorizontal = Math.max(size.x, size.z);
  if (maxHorizontal > 0) {
    const fitScale = MAX_FOOTPRINT / maxHorizontal;
    // Only shrink, never enlarge beyond what fits
    const s = Math.min(fitScale, 1);
    if (s < 1) {
      group.scale.multiplyScalar(s);
      // Recompute after scaling
      box.setFromObject(group);
      box.getSize(size);
      box.getCenter(center);
    }
  }

  // Center on X/Z, place bottom at Y=0
  group.position.set(-center.x, -box.min.y, -center.z);
}

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
    // Strip function wrapper if LLM returned "function(THREE) { ... }" instead of body
    let cleanCode = code;
    const wrapperMatch = cleanCode.match(
      /^(?:function\s*\(THREE\)|(?:\(THREE\)|\bTHREE\b)\s*=>)\s*\{([\s\S]*)\}\s*$/
    );
    if (wrapperMatch) {
      cleanCode = wrapperMatch[1].trim();
    }

    const fn = new Function("THREE", `"use strict";\n${cleanCode}`);
    const result = fn(THREE);

    let group: THREE.Group;
    if (result instanceof THREE.Group) {
      group = result;
    } else if (result instanceof THREE.Object3D) {
      group = new THREE.Group();
      group.add(result);
    } else {
      console.warn("[ProceduralLoader] Code did not return a THREE.Object3D");
      return createFallbackGroup();
    }

    // Ensure all materials use DoubleSide rendering and downgrade
    // MeshPhysicalMaterial to MeshStandardMaterial for shared GL compatibility
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (let i = 0; i < mats.length; i++) {
          const mat = mats[i];
          mat.side = THREE.DoubleSide;
          // MeshPhysicalMaterial can render black in shared GL contexts
          // without environment maps — downgrade to MeshStandardMaterial
          if (
            mat.type === "MeshPhysicalMaterial" &&
            !(mat as THREE.MeshPhysicalMaterial).envMap
          ) {
            const std = new THREE.MeshStandardMaterial({
              color: (mat as THREE.MeshStandardMaterial).color,
              roughness: (mat as THREE.MeshStandardMaterial).roughness,
              metalness: Math.min(
                (mat as THREE.MeshStandardMaterial).metalness,
                0.5
              ),
              transparent: mat.transparent,
              opacity: mat.opacity,
              side: THREE.DoubleSide,
            });
            mat.dispose();
            if (Array.isArray(child.material)) {
              child.material[i] = std;
            } else {
              child.material = std;
            }
          }
        }
      }
    });

    // Fit the building within the plot footprint
    normalizeToPlot(group);

    return group;
  } catch (err) {
    console.error("[ProceduralLoader] Failed to execute generated code:", err);
    return createFallbackGroup();
  }
}

function createFallbackGroup(): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(20, 50, 20);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 25;
  group.add(mesh);
  return group;
}
