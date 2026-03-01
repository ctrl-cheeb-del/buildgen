const SFX_PATHS = ["/sfx/crazy.mp3", "/sfx/ouchy.mp3", "/sfx/my-leg.mp3"];

let audioCtx: AudioContext | null = null;
let buffers: AudioBuffer[] = [];
let loaded = false;
let loading = false;

/** Initialize audio on first user interaction (avoids autoplay policy) */
export function initNPCSounds(): void {
  if (loaded || loading) return;
  loading = true;

  audioCtx = new AudioContext();
  const ctx = audioCtx;

  Promise.all(
    SFX_PATHS.map((path) =>
      fetch(path)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
    )
  )
    .then((decoded) => {
      buffers = decoded;
      loaded = true;
      loading = false;
    })
    .catch((err) => {
      console.warn("[NPC Sounds] Failed to load SFX:", err);
      loading = false;
    });
}

/** Play a random collision sound effect */
export function playCollisionSound(): void {
  if (!loaded || !audioCtx || buffers.length === 0) return;

  // Resume context if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const buffer = buffers[Math.floor(Math.random() * buffers.length)];
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const gain = audioCtx.createGain();
  gain.gain.value = 0.7;

  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}
