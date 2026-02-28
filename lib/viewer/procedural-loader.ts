import * as THREE from "three";
import {
  PLOT_SIZE_M,
  PAVEMENT_WIDTH_M,
} from "../grid/grid-constants";

/** Maximum footprint — full grass area of a plot (120m minus 6m pavement each side) */
const MAX_FOOTPRINT = PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M; // 108m

/**
 * Normalize a group so its XZ footprint fits within MAX_FOOTPRINT and
 * the model is centered on X/Z with its base at Y=0.
 * Height is preserved proportionally — a house stays short, a skyscraper stays tall.
 */
function normalizeToPlot(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Scale uniformly so the largest horizontal dimension fits the plot.
  // Uniform scale preserves the building's height-to-width proportions,
  // so a cottage stays short and a supertall stays tall.
  const maxHorizontal = Math.max(size.x, size.z);
  if (maxHorizontal > 0) {
    const fitScale = MAX_FOOTPRINT / maxHorizontal;
    // Only shrink to fit the plot footprint, never enlarge
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
 * Quick syntax pre-check: catches truncated LLM output (unbalanced
 * delimiters) without ever calling `new Function()`, which would throw
 * a SyntaxError and trigger the Next.js dev error overlay.
 */
function hasBalancedDelimiters(code: string): boolean {
  let braces = 0,
    brackets = 0,
    parens = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (inString) {
      if (ch === stringChar && code[i - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
    else if (ch === "(") parens++;
    else if (ch === ")") parens--;
    if (braces < 0 || brackets < 0 || parens < 0) return false;
  }
  return braces === 0 && brackets === 0 && parens === 0;
}

/**
 * Evaluates a generated Three.js code string and returns a Group.
 * The code should be a function body that uses THREE and returns a THREE.Group.
 */
export function loadProceduralGeometry(code: string): THREE.Group {
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    console.warn("[ProceduralLoader] Empty or missing code, using fallback");
    return createFallbackGroup();
  }

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

    // Catch truncated LLM output before calling new Function()
    if (!hasBalancedDelimiters(cleanCode)) {
      console.warn(
        "[ProceduralLoader] Code has unbalanced delimiters (likely truncated), using fallback"
      );
      return createFallbackGroup();
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

    // Fix rendering for all materials:
    // 1. Strip DoubleSide — winding inversion is handled by gl.frontFace(CW)
    //    in the render loop. DoubleSide causes z-fighting between the front
    //    and back faces of the same wall (especially visible on glass panels
    //    placed near opaque walls).
    // 2. Transparent materials get depthWrite:false + polygonOffset so glass
    //    panels don't z-fight with the wall behind them.
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) {
          mat.side = THREE.FrontSide;
          if (mat.transparent) {
            mat.depthWrite = false;
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -1;
            mat.polygonOffsetUnits = -1;
          }
        }
      }
    });

    // Fit the building within the plot footprint
    normalizeToPlot(group);

    return group;
  } catch (err) {
    console.warn("[ProceduralLoader] Failed to execute generated code:", err);
    return createFallbackGroup();
  }
}

function createFallbackGroup(): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(20, 50, 20);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    roughness: 0.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = 25;
  group.add(mesh);
  return group;
}
