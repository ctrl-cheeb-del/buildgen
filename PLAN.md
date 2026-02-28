# Lovable for Buildings — Implementation Plan (v2)

## Vision

Two ways to create a building, one unified output:

1. **Existing building** — Upload/search a photo of a real building → recreate it in 3D (with QA iteration loop)
2. **Prompt anything** — Describe a building in text → generate it in 3D (with QA iteration loop)
3. **Interiors** — For any building from either flow → generate interior Gaussian splat tour

All on a Mapbox 3D map. **Mistral hackathon entry** — all LLM calls use Mistral APIs.

---

## The Key Insight: One Interface

Both input flows produce the same thing: a `BuildingModel`. Interiors consume a `BuildingModel`. That's the entire contract.

```
Flow 1 (real building):
  Photo/search → reference images → multi-view → geometry code → QA spiral → BuildingModel
                                                       ↑ same from here

Flow 2 (prompt):
  Text prompt → multi-view generation → geometry code → QA spiral → BuildingModel
                                                       ↑ same from here

Flow 3 (interiors):
  BuildingModel (from either flow) → interior layout → gaussian splat → InteriorTour
```

The only difference between Flow 1 and Flow 2 is **how reference images are obtained**:
- Flow 1: Extract/search photos of the real building, then generate multi-view elevations from those
- Flow 2: Generate multi-view elevations directly from the text prompt

Once you have `MultiViewImages`, the rest of the pipeline is identical.

---

## Team Structure

**You** = orchestrator (this Claude session)
**3 other people** = 3 separate Claude Code sessions, each in a worktree

### Workstreams

| # | Name | Owns | What they do |
|---|------|------|-------------|
| **W1** | The Architect | `src/pipeline/` | Multi-view generation, geometry code gen, QA iteration spiral. Both input flows (photo → views, prompt → views) and the shared pipeline after that. |
| **W2** | The Interior Designer | `src/interiors/` | Takes a `BuildingModel`, generates interior layout, creates Gaussian splat via World Labs, builds tour viewer. |
| **W3** | The Platform Builder | `src/platform/`, `src/map/`, `src/orchestrator/`, `src/app/` | Next.js shell, Mapbox map, prompt bar, API routes, orchestrator that wires W1 + W2 together. |

### How they coordinate

Each person's Claude Code instance reads the **same `CLAUDE.md`** at the repo root:
- Which directories each workstream owns (no cross-editing)
- The shared TypeScript interfaces (the contract)
- Exported function signatures each workstream must implement
- Git branch naming conventions (`ws1/`, `ws2/`, `ws3/`)

**Communication flow:**
```
CLAUDE.md (source of truth)
    ↓ read by all 3 Claude instances
src/shared/types.ts (the contract between workstreams)
    ↓ imported by all workstream code
Git branches → PRs to main
```

No real-time communication. Coordination through:
1. **CLAUDE.md** — every instance reads this on startup
2. **Shared types** — `src/shared/types.ts` is the interface contract
3. **Git** — each workstream pushes to `ws{N}/feature-name`, merges via PR
4. **Directory ownership** — W1 never touches `src/interiors/`, W2 never touches `src/pipeline/`, etc.

---

## Project Structure

```
lovable-for-buildings/
├── CLAUDE.md                          # Coordination file for all Claude instances
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── .env.local                         # All API keys (gitignored)
├── .env.example
│
├── public/
│   └── draco/                         # Draco decoder for GLB loading
│
├── src/
│   ├── app/                           # Next.js App Router (W3 owns)
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Main map + prompt bar
│   │   ├── globals.css
│   │   ├── api/
│   │   │   ├── generate/route.ts      # Master orchestration endpoint (SSE)
│   │   │   ├── pipeline/
│   │   │   │   ├── multiview/route.ts # Multi-view generation (both flows)
│   │   │   │   ├── geometry/route.ts  # Codestral geometry gen
│   │   │   │   ├── qa/route.ts        # Pixtral QA evaluation
│   │   │   │   └── iterate/route.ts   # Full QA spiral loop
│   │   │   ├── interiors/
│   │   │   │   ├── layout/route.ts    # Interior layout generation
│   │   │   │   └── splat/route.ts     # World Labs splat generation
│   │   │   └── orchestrator/route.ts  # Mistral Large 3 orchestrator
│   │   └── tour/[buildingId]/page.tsx # Interior tour viewer page
│   │
│   ├── shared/                        # ALL workstreams read, changes need agreement
│   │   ├── types.ts                   # Master type definitions
│   │   ├── constants.ts               # Model IDs, limits
│   │   ├── config.ts                  # Env var access (server-side only)
│   │   └── events.ts                  # Cross-component event bus
│   │
│   ├── pipeline/                      # WORKSTREAM 1: "The Architect"
│   │   ├── source-photo.ts            # Flow 1: photo → reference images
│   │   ├── source-prompt.ts           # Flow 2: prompt → multi-view images
│   │   ├── multiview.ts               # Shared: normalize any source into MultiViewImages
│   │   ├── geometry-gen.ts            # Codestral → Three.js code
│   │   ├── qa-evaluator.ts            # Pixtral Large screenshot comparison
│   │   ├── iteration-loop.ts          # QA spiral orchestrator
│   │   ├── procedural-loader.ts       # Code eval → THREE.Group
│   │   ├── glb-loader.ts             # GLB loading + normalization
│   │   ├── screenshot.ts              # Offscreen renderer for QA
│   │   └── prompts/
│   │       ├── geometry-system.ts     # Codestral system prompt
│   │       ├── qa-system.ts           # Pixtral QA prompt
│   │       └── correction.ts          # Correction templates
│   │
│   ├── interiors/                     # WORKSTREAM 2: "The Interior Designer"
│   │   ├── interior-layout.ts         # Mistral Large 3 → room layout from BuildingModel
│   │   ├── worldlabs-client.ts        # World Labs Marble API client
│   │   ├── splat-loader.ts            # Gaussian splat loading (SparkJS)
│   │   ├── tour-camera.ts             # Camera path gen + transitions
│   │   ├── tour-viewer.tsx            # First-person walkthrough component
│   │   └── tour-controls.tsx          # Tour playback UI controls
│   │
│   ├── platform/                      # WORKSTREAM 3: "The Urban Planner"
│   │   ├── components/
│   │   │   ├── PromptBar.tsx          # Input: text prompt OR photo upload
│   │   │   ├── MapCanvas.tsx          # Mapbox GL wrapper
│   │   │   ├── PlotSelector.tsx       # Plot selection overlay
│   │   │   ├── Gallery.tsx            # Saved generations gallery
│   │   │   ├── LayersPanel.tsx        # Building layers management
│   │   │   ├── TransformControls.tsx  # Scale/rotation/offset
│   │   │   ├── StatusPanel.tsx        # Pipeline step indicators
│   │   │   └── LoadingOverlay.tsx     # Pipeline progress overlay
│   │   ├── hooks/
│   │   │   ├── useMapbox.ts
│   │   │   ├── useThreeLayer.ts
│   │   │   ├── useWorldState.ts
│   │   │   └── usePipeline.ts
│   │   └── stores/
│   │       ├── world-store.ts
│   │       └── pipeline-store.ts
│   │
│   ├── map/                           # WORKSTREAM 3: Map code
│   │   ├── mapbox-layer.ts            # Three.js Mapbox custom layer
│   │   ├── plot-parcels.ts
│   │   ├── terrain.ts
│   │   └── context-buildings.ts
│   │
│   └── orchestrator/                  # WORKSTREAM 3: Mistral Large 3
│       ├── agent.ts                   # Mistral Agents API wrapper
│       ├── orchestrator.ts            # Master pipeline orchestrator
│       └── prompts.ts
```

---

## The Unified Pipeline

### Entry point: `source` determines the flow

```typescript
type BuildingSource =
  | { type: 'photo'; imageUrl: string; buildingName?: string }
  | { type: 'prompt'; prompt: string };
```

### Pipeline (what W3's orchestrator calls):

```
1. Determine source type
2. If photo:  W1.extractReferenceViews(imageUrl) → MultiViewImages
   If prompt: W1.generateMultiView(prompt)       → MultiViewImages
3. W1.generateGeometryCode(views, prompt) → initial Three.js code
4. W1.runQASpiral(views, code, prompt)    → refined code (2-5 iterations)
5. → BuildingModel (placed on map)
6. User clicks "Enter building" →
7. W2.generateInteriorLayout(buildingModel) → InteriorRoom[]
8. W2.generateGaussianSplat(rooms)          → splat data
9. → InteriorTour (full-screen walkthrough)
```

Step 5 is the **handoff point**. W2 doesn't care whether the building came from a photo or a prompt. It just receives a `BuildingModel` with geometry + reference images + QA history.

---

## Workstream 1: "The Architect" — 3D Building Generation

**Owner:** Person 1
**Directory:** `src/pipeline/`
**Mistral models:** Codestral (code gen) + Pixtral Large (QA)

### What they build:

**Two source adapters (the only difference between flows):**
1. `source-photo.ts` — Takes a photo URL → uses Pixtral to identify the building → generates multi-view elevations (via fal.ai image-to-image with the photo as reference)
2. `source-prompt.ts` — Takes a text prompt → generates multi-view elevations directly (via fal.ai Nano Banana Pro 2x2 grid + split)

**Shared pipeline (runs the same regardless of source):**
3. `geometry-gen.ts` — Codestral takes multi-view images → generates Three.js procedural code
4. `qa-evaluator.ts` — Pixtral Large compares rendered screenshot vs reference views → score + critique
5. `iteration-loop.ts` — QA spiral: render → screenshot → evaluate → fix code → repeat until converged

**Ported from existing repo (minimal changes):**
6. `procedural-loader.ts` — eval code → THREE.Group
7. `glb-loader.ts` — GLB loading
8. `screenshot.ts` — offscreen renderer

### Exports:

```typescript
// Source adapters
extractReferenceViews(imageUrl: string, falKey: string) → MultiViewImages
generateMultiView(prompt: string, falKey: string) → MultiViewImages

// Shared pipeline
generateGeometryCode(prompt: string, views: MultiViewImages, mistralApiKey: string) → string
evaluateQA(screenshot: string, views: MultiViewImages, code: string, prompt: string, apiKey: string)
  → { score: number; evaluation: string; improvedCode?: string; converged: boolean }
runQASpiral(prompt: string, views: MultiViewImages, initialCode: string, apiKey: string, screenshotFn: () => string, maxIter?: number)
  → { finalCode: string; iterations: IterationRecord[] }

// Loaders
loadProceduralGeometry(code: string) → THREE.Group
loadGLB(url: string) → THREE.Group
```

### Existing code to port:
- `building-generator/src/services/multi-view.ts` → `source-prompt.ts` (swap config for params)
- `building-generator/src/services/geometry-gen.ts` → `geometry-gen.ts` (swap Gemini for Codestral)
- `building-generator/src/services/iteration.ts` → `iteration-loop.ts` (swap Gemini for Pixtral)
- `building-generator/src/services/image-search.ts` → part of `source-photo.ts`
- `building-generator/src/viewer/procedural-loader.ts` → direct port
- `building-generator/src/viewer/glb-loader.ts` → direct port

---

## Workstream 2: "The Interior Designer" — Gaussian Splat Interiors

**Owner:** Person 2
**Directory:** `src/interiors/`
**Mistral models:** Mistral Large 3 (interior layout planning)

### What they build:

1. `interior-layout.ts` — Takes a `BuildingModel` (geometry + type + dimensions) → uses Mistral Large 3 to plan rooms, their sizes, purposes, and visual descriptions
2. `worldlabs-client.ts` — World Labs Marble API: upload reference → submit generation job → poll → get splat URL
3. `splat-loader.ts` — Load Gaussian splats into Three.js scene
4. `tour-camera.ts` — Generate Catmull-Rom spline camera paths through rooms
5. `tour-viewer.tsx` + `tour-controls.tsx` — Full-screen interior tour React components

### The interiors flow:

```
BuildingModel
  ↓
interior-layout.ts: "This is a 3-story office tower, 40m × 20m footprint"
  → Mistral Large 3 plans rooms: lobby, offices, conference room, roof deck
  → Each room gets: dimensions, camera viewpoint, description for splat generation
  ↓
worldlabs-client.ts: For each key room:
  → Generate a reference image (Pixtral/prompt → image of that interior)
  → Submit to World Labs → get Gaussian splat
  ↓
splat-loader.ts + tour-camera.ts:
  → Load splats into scene
  → Generate camera path connecting rooms
  ↓
tour-viewer.tsx:
  → Full-screen first-person walkthrough
```

### Exports:

```typescript
generateInteriorLayout(buildingModel: BuildingModel, apiKey: string) → InteriorRoom[]
generateGaussianSplat(roomImage: string, worldLabsApiKey: string) → GaussianSplatData
loadSplat(splatUrl: string, scene: THREE.Scene) → void
generateCameraPath(rooms: InteriorRoom[], duration: number) → CameraKeyframe[]
// + TourViewer and TourControls React components
```

### What W2 receives (their input contract):

```typescript
interface BuildingModel {
  id: string;
  name: string;                    // "Empire State Building" or "mushroom tower"
  source: BuildingSource;          // { type: 'photo', ... } or { type: 'prompt', ... }
  views: MultiViewImages;          // The 4 reference elevation views
  geometry: BuildingGeometry;      // The Three.js code or GLB
  qaHistory: IterationRecord[];    // How the QA spiral went
  location: { lng: number; lat: number };
  dimensions?: { width: number; depth: number; height: number }; // estimated from geometry
}
```

W2 doesn't need to know or care how this was produced. They just use `name`, `views`, `geometry`, and `dimensions` to plan the interior.

---

## Workstream 3: "The Urban Planner" — Platform & Orchestration

**Owner:** Person 3
**Directories:** `src/platform/`, `src/map/`, `src/orchestrator/`, `src/app/`
**Mistral models:** Mistral Large 3 (master orchestrator via Agents API)

### What they build:

1. Next.js app shell — layout, page, Tailwind
2. `PromptBar.tsx` — Unified input: text prompt OR photo upload/URL. One input, two flows.
3. `MapCanvas.tsx` — Mapbox GL wrapper with 3D terrain + buildings
4. `mapbox-layer.ts` — Port Three.js custom layer from existing repo
5. `PlotSelector.tsx` — Click-to-select plot parcels
6. Zustand stores — world state (buildings) + pipeline state (progress)
7. All API routes — thin wrappers calling W1/W2 functions
8. `orchestrator/` — Mistral Large 3 Agents API:
   - Determines source type from user input
   - Refines prompts
   - Decides generation path
   - Manages QA iterations
   - Triggers interior generation when requested

### The master `/api/generate` endpoint (SSE):

```
1. User submits input (text prompt or photo)
2. Orchestrator determines source type
3. If photo: call W1.extractReferenceViews()
   If prompt: call W1.generateMultiView()
   → MultiViewImages
4. Call W1.generateGeometryCode() → initial Three.js code
5. Call W1.runQASpiral() → refined code (2-5 iterations)
6. → Return BuildingModel (placed on map, user sees it)
7. [User clicks "Enter building"]
8. Call W2.generateInteriorLayout()
9. Call W2.generateGaussianSplat() for key rooms
10. → Return InteriorTour (user enters walkthrough)
```

---

## The QA Spiral (Core Innovation)

```
Reference Images (4x views)
        │
        ▼
┌─────────────────────────────────────────────┐
│              QA SPIRAL LOOP                  │
│                                              │
│  Codestral ──→ Three.js Eval ──→ Screenshot  │
│  (code gen)    (code→Group)     (512x512)    │
│      ▲                              │        │
│      │         Pixtral Large ◄──────┘        │
│      │         (score 0-100)                 │
│      │              │                        │
│      └──────────────┘ if score < 80          │
│                                              │
│  Exit when: score≥80 OR 5 iterations OR      │
│  score plateaus for 2 consecutive rounds     │
└─────────────────────────────────────────────┘
```

Same loop runs regardless of whether the reference images came from a photo or a prompt.

---

## Shared Types Contract (`src/shared/types.ts`)

### Core types:

```typescript
// The unified source — this is the ONLY difference between the two flows
type BuildingSource =
  | { type: 'photo'; imageUrl: string; buildingName?: string }
  | { type: 'prompt'; prompt: string };

// Multi-view reference images (produced by W1, consumed by W1 QA + W2 interiors)
interface MultiViewImages {
  front: string;    // data URL or URL
  right: string;
  back: string;
  left: string;
  gridUrl?: string; // original 2x2 grid if generated
}

// The geometry output (procedural code or GLB)
interface BuildingGeometry {
  type: 'procedural' | 'glb';
  code?: string;       // Three.js code if procedural
  glbUrl?: string;     // GLB URL if mesh
}

// QA iteration history
interface IterationRecord {
  index: number;
  screenshot: string;
  code: string;
  score: number;
  evaluation: string;
}

// ★ THE UNIFIED OUTPUT — the handoff between exterior and interior
interface BuildingModel {
  id: string;
  name: string;
  source: BuildingSource;
  views: MultiViewImages;
  geometry: BuildingGeometry;
  qaHistory: IterationRecord[];
  location: { lng: number; lat: number };
  dimensions?: { width: number; depth: number; height: number };
}

// Interior types (W2 produces, W3 consumes)
interface InteriorRoom {
  name: string;
  type: string;        // 'lobby' | 'office' | 'conference' | etc.
  floor: number;
  dimensions: { width: number; depth: number; height: number };
  description: string; // visual description for splat generation
  splatUrl?: string;
  cameraPosition: [number, number, number];
}

interface InteriorTour {
  buildingId: string;
  rooms: InteriorRoom[];
  cameraPath: CameraKeyframe[];
}

interface CameraKeyframe {
  position: [number, number, number];
  target: [number, number, number];
  time: number;
}

// World state (W3 internal)
interface WorldBuilding {
  id: string;
  model: BuildingModel;
  transform: {
    scale: number;
    offset: [number, number, number];
    rotation: [number, number, number];
  };
  visible: boolean;
  interiorTour?: InteriorTour;
}

// Pipeline progress (W3 internal)
interface PipelineStatus {
  step: 'source' | 'multiview' | 'geometry' | 'qa-spiral' | 'interior-layout' | 'splat-gen' | 'done';
  state: 'running' | 'done' | 'error';
  detail?: string;
  iteration?: number;
  maxIterations?: number;
}
```

### Producer/Consumer map:

| Type | Producer | Consumer | Purpose |
|------|----------|----------|---------|
| `BuildingSource` | W3 (user input) | W1 | Determines which source adapter to use |
| `MultiViewImages` | W1 | W1 (QA), W2 (interiors) | 4 reference elevation views |
| `BuildingGeometry` | W1 | W2, W3 | The generated 3D code or GLB |
| `BuildingModel` | W1 | W2, W3 | **The unified handoff** — complete exterior |
| `InteriorRoom[]` | W2 | W3 | Room layout + splat data |
| `InteriorTour` | W2 | W3 | Complete interior walkthrough |
| `WorldBuilding` | W3 | W3 | Map state per building |
| `PipelineStatus` | W3 | W3 | UI progress tracking |

---

## Mistral API Allocation

| Model | API ID | Workstream | Purpose |
|-------|--------|------------|---------|
| Codestral | `codestral-2508` | W1 | Three.js code generation from multi-view images |
| Pixtral Large | `pixtral-large-latest` | W1 | Visual QA — compare renders vs reference images |
| Mistral Large 3 | `mistral-large-latest` | W2, W3 | Interior layout planning (W2) + master orchestrator (W3) |

All keys in `.env.local`, server-side only. Single `MISTRAL_API_KEY`.

---

## Dependencies

```json
{
  "@mistralai/mistralai": "^1.0.0",
  "@fal-ai/client": "^1.2.1",
  "mapbox-gl": "^3.9.4",
  "three": "^0.172.0",
  "@types/three": "^0.172.0",
  "zustand": "^4.5.0",
  "next": "^14.2.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "tailwindcss": "^3.4.0"
}
```

---

## Git Strategy

- `main` — stable, deployable
- `ws1/feature-name` — Workstream 1 branches
- `ws2/feature-name` — Workstream 2 branches
- `ws3/feature-name` — Workstream 3 branches
- PRs to main. Shared types changes need all 3 approvals.

---

## Implementation Order

**Phase 1 (parallel — all 3 start simultaneously):**
- W1: Port multi-view gen (both source adapters), rewrite geometry-gen for Codestral
- W2: Build World Labs client, splat loader, basic tour viewer
- W3: Scaffold Next.js app, Mapbox integration, prompt bar (with photo upload)

**Phase 2 (parallel — after Phase 1):**
- W1: Build QA spiral (Pixtral + Codestral loop), both flows end-to-end
- W2: Interior layout gen with Mistral Large 3, camera path generation
- W3: API routes, Zustand stores, orchestrator agent, SSE streaming

**Phase 3 (integration):**
- W3: Wire up API routes to W1/W2 functions
- All: End-to-end testing — photo flow, prompt flow, interior tour
- Polish: Demo flow, error handling, loading states
