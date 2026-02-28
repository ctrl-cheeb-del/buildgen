import * as THREE from "three";

/**
 * Material properties for a texture as defined in the manifest / nanobanana.
 */
export interface TextureMeta {
  id: string;
  name: string;
  /** Path relative to public root, e.g. "/textures/pavement-slabs.png" */
  file: string;
  /** How many times to tile across a 30m side */
  repeat: number;
  roughness: number;
  metalness: number;
  /** Path to the normal map file, if generated */
  normalFile?: string;
  /** Normal map intensity (THREE.Vector2 scale) */
  normalScale?: number;
}

// In-memory cache so we never load the same texture twice
const cache = new Map<string, THREE.Texture>();

const loader = new THREE.TextureLoader();

// Resolved lazily on first use — needs a renderer to query
let maxAnisotropy = 0;

/**
 * Call once after creating the renderer to enable max anisotropic filtering.
 * Keeps textures crisp at oblique camera angles.
 */
export function initTextureQuality(renderer: THREE.WebGLRenderer): void {
  maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
}

/**
 * Load a texture from a URL or base64 data URL and configure it for tiling.
 */
export function loadTileableTexture(
  src: string,
  repeat: number
): THREE.Texture {
  const cached = cache.get(src);
  if (cached) return cached;

  const texture = loader.load(src);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (maxAnisotropy > 0) texture.anisotropy = maxAnisotropy;

  cache.set(src, texture);
  return texture;
}

/**
 * Load a normal map texture and configure it for tiling.
 * Uses LinearSRGBColorSpace — sRGB gamma would corrupt normal vectors.
 */
export function loadTileableNormalMap(
  src: string,
  repeat: number
): THREE.Texture {
  const key = `normal:${src}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const texture = loader.load(src);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (maxAnisotropy > 0) texture.anisotropy = maxAnisotropy;

  cache.set(key, texture);
  return texture;
}

/**
 * Load a texture from a base64 data URL string.
 * Useful when textures are generated on the fly via the nanobanana API.
 */
export function loadBase64Texture(
  base64DataUrl: string,
  repeat: number
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const cached = cache.get(base64DataUrl);
    if (cached) {
      resolve(cached);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const texture = new THREE.Texture(img);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      if (maxAnisotropy > 0) texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;

      cache.set(base64DataUrl, texture);
      resolve(texture);
    };
    img.onerror = reject;
    img.src = base64DataUrl;
  });
}

/**
 * Create a MeshPhysicalMaterial with a tileable texture applied.
 * Applies normal map when normalFile is present in meta.
 */
export function createTexturedMaterial(
  src: string,
  meta: Pick<TextureMeta, "repeat" | "roughness" | "metalness" | "normalFile" | "normalScale">
): THREE.MeshPhysicalMaterial {
  const map = loadTileableTexture(src, meta.repeat);
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    roughness: meta.roughness,
    metalness: meta.metalness,
  });

  if (meta.normalFile) {
    mat.normalMap = loadTileableNormalMap(meta.normalFile, meta.repeat);
    const s = meta.normalScale ?? 1.0;
    mat.normalScale = new THREE.Vector2(s, s);
  }

  return mat;
}

/**
 * Fetch the generated texture manifest from public/textures/manifest.json.
 * Returns the list of available pre-generated textures.
 */
export async function fetchTextureManifest(): Promise<TextureMeta[]> {
  const res = await fetch("/textures/manifest.json");
  if (!res.ok) return [];
  return res.json();
}

/**
 * Create a flat ground plane mesh with a tileable texture.
 * Useful for adding textured ground to the Three.js scene.
 *
 * @param width   Width in meters (default 30 = one plot)
 * @param height  Height in meters (default 30 = one plot)
 */
export function createTexturedGround(
  textureSrc: string,
  meta: Pick<TextureMeta, "repeat" | "roughness" | "metalness">,
  width = 30,
  height = 30
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = createTexturedMaterial(textureSrc, meta);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // lay flat
  return mesh;
}

/**
 * Dispose all cached textures. Call on cleanup.
 */
export function disposeTextureCache(): void {
  for (const tex of cache.values()) {
    tex.dispose();
  }
  cache.clear();
}
