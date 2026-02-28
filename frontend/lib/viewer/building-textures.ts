import * as THREE from "three";
import {
  fetchTextureManifest,
  loadTileableTexture,
  loadTileableNormalMap,
  type TextureMeta,
} from "./texture-loader";

/** Cached manifest, fetched once on first call */
let manifestPromise: Promise<TextureMeta[]> | null = null;
let manifestCache: Map<string, TextureMeta> | null = null;

async function getManifest(): Promise<Map<string, TextureMeta>> {
  if (manifestCache) return manifestCache;
  if (!manifestPromise) manifestPromise = fetchTextureManifest();
  const list = await manifestPromise;
  manifestCache = new Map(list.map((m) => [m.id, m]));
  return manifestCache;
}

/**
 * Compute a sensible UV repeat count for a mesh based on its world-space
 * bounding box. The texture definition's `repeat` is calibrated for a 30m
 * plot side. We scale proportionally to the mesh's two largest dimensions.
 *
 * Note: For rotated meshes the AABB may be larger than the actual face,
 * producing slightly more repeat tiles than needed — acceptable approximation.
 */
function computeRepeat(
  mesh: THREE.Mesh,
  baseRepeat: number
): [number, number] {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());

  // Use the two largest dimensions as U and V span
  const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
  const uSpan = dims[0];
  const vSpan = dims[1];

  // baseRepeat is per 30m, scale proportionally
  const scale = baseRepeat / 30;
  const uRepeat = Math.max(1, Math.round(uSpan * scale));
  const vRepeat = Math.max(1, Math.round(vSpan * scale));
  return [uRepeat, vRepeat];
}

/**
 * Clone a cached texture with per-mesh repeat values.
 */
function cloneWithRepeat(
  texture: THREE.Texture,
  uRepeat: number,
  vRepeat: number
): THREE.Texture {
  const t = texture.clone();
  t.needsUpdate = true;
  t.repeat.set(uRepeat, vRepeat);
  return t;
}

/**
 * Walk a building group and apply textures to every mesh that has
 * `mesh.userData.textureId` set. Meshes without the annotation keep
 * their existing solid-color material unchanged.
 *
 * The original material color is preserved as a tint that multiplies
 * against the texture — set color to 0xffffff for an untinted texture.
 */
export async function applyBuildingTextures(
  group: THREE.Group
): Promise<void> {
  const manifest = await getManifest();
  if (manifest.size === 0) return;

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const textureId = child.userData?.textureId as string | undefined;
    if (!textureId) return;

    const meta = manifest.get(textureId);
    if (!meta) {
      console.warn(
        `[BuildingTextures] Unknown textureId "${textureId}", skipping`
      );
      return;
    }

    // Compute per-mesh repeat based on dimensions
    const [uRepeat, vRepeat] = computeRepeat(child, meta.repeat);

    // Load + clone diffuse texture with per-mesh repeat
    const baseTex = loadTileableTexture(meta.file, 1);
    const meshTexture = cloneWithRepeat(baseTex, uRepeat, vRepeat);

    // Preserve original color as tint
    const oldMats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const tintColor =
      oldMats[0] instanceof THREE.MeshStandardMaterial
        ? oldMats[0].color.clone()
        : new THREE.Color(0xffffff);

    // Create new material with texture
    const newMat = new THREE.MeshStandardMaterial({
      map: meshTexture,
      color: tintColor,
      roughness: meta.roughness,
      metalness: meta.metalness,
      side: THREE.DoubleSide,
    });

    // Apply normal map if available
    if (meta.normalFile && meta.normalScale) {
      const baseNormal = loadTileableNormalMap(meta.normalFile, 1);
      newMat.normalMap = cloneWithRepeat(baseNormal, uRepeat, vRepeat);
      newMat.normalScale = new THREE.Vector2(
        meta.normalScale,
        meta.normalScale
      );
    }

    // Defer disposal of old materials to avoid mid-frame flash
    const toDispose = oldMats;
    requestAnimationFrame(() => {
      for (const m of toDispose) m.dispose();
    });

    child.material = newMat;
  });
}
