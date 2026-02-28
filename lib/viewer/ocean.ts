import * as THREE from "three";

/**
 * Infinite-look ocean plane surrounding the city grid.
 * Uses a lightweight ShaderMaterial with layered sine-wave displacement
 * — single draw call, no textures, no extra GPU memory.
 *
 * The ocean fades to transparent at its edges so it blends naturally
 * into the sky background without needing heavy fog.
 */

const OCEAN_SIZE = 8000; // 8km across — well beyond camera max distance
const OCEAN_SEGMENTS = 64; // enough for smooth visible waves

const vertexShader = /* glsl */ `
  uniform float uTime;

  varying float vWaveHeight;
  varying float vDistFromCenter;

  void main() {
    vec3 pos = position;

    // Normalised distance from center (0 at origin, 1 at edge)
    vDistFromCenter = length(pos.xz) / ${(OCEAN_SIZE / 2).toFixed(1)};

    // Suppress waves near city center so they don't clip through buildings
    float cityRadius = 120.0;
    float waveDamping = smoothstep(cityRadius, cityRadius + 80.0, length(pos.xz));

    // Layered sine waves — different frequencies + speeds for natural motion
    float w1 = sin(pos.x * 0.02  + uTime * 0.8) *
               cos(pos.z * 0.015 + uTime * 0.6) * 1.5;
    float w2 = sin(pos.x * 0.04  + pos.z * 0.03 + uTime * 1.2) * 0.8;
    float w3 = cos(pos.x * 0.008 - uTime * 0.35) *
               sin(pos.z * 0.012 + uTime * 0.45) * 2.5;

    float displacement = (w1 + w2 + w3) * waveDamping;
    pos.y += displacement;

    // Normalised wave height for fragment colour (-1..1 → 0..1)
    vWaveHeight = displacement / 4.8 * 0.5 + 0.5;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vWaveHeight;
  varying float vDistFromCenter;

  void main() {
    // Three-tone ocean palette
    vec3 deep    = vec3(0.04, 0.12, 0.35);  // troughs
    vec3 surface = vec3(0.08, 0.25, 0.50);  // mid-level
    vec3 crest   = vec3(0.30, 0.50, 0.65);  // wave crests / specular hint

    vec3 color = mix(deep, surface, vWaveHeight);
    color = mix(color, crest, smoothstep(0.65, 0.95, vWaveHeight));

    // Fade to transparent near city center and at far edges
    float edgeFade = 1.0 - smoothstep(0.4, 0.95, vDistFromCenter);
    float centerFade = smoothstep(0.01, 0.04, vDistFromCenter);
    float fade = edgeFade * centerFade;

    gl_FragColor = vec4(color, fade * 0.92);
  }
`;

export interface Ocean {
  mesh: THREE.Mesh;
  update(elapsed: number): void;
  dispose(): void;
}

export function createOcean(): Ocean {
  const geo = new THREE.PlaneGeometry(
    OCEAN_SIZE,
    OCEAN_SIZE,
    OCEAN_SEGMENTS,
    OCEAN_SEGMENTS
  );

  // Rotate flat on XZ and drop well below ground so wave crests don't clip through
  const mat4 = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  mat4.setPosition(0, -6, 0);
  geo.applyMatrix4(mat4);

  const uniforms = { uTime: { value: 0 } };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -998; // behind ground, in front of clouds (-999)

  return {
    mesh,
    update(elapsed: number) {
      uniforms.uTime.value = elapsed;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
