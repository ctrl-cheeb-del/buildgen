# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start Next.js + Convex dev servers concurrently
bun run build        # Production build
bun run lint         # ESLint (Next.js core web vitals + TypeScript + Convex plugin)
```

Package manager is **Bun** (1.3.9). No test suite — visual testing happens via the `/viewer` page iteration loop.

## Architecture

**Stack**: Next.js 16 + React 19 + Three.js 0.172.0 + Convex (real-time DB) + Clerk (auth) + Zustand (state)

This is a 3D city builder where users claim plots on an 8x10 grid, describe a building via text prompt, and an AI pipeline generates procedural Three.js code that renders in-browser. A tick-based city simulation runs AI agents (mayor + citizens) that interact with the built environment.

### Rendering (Three.js)

All 3D rendering is pure Three.js with OrbitControls — no Mapbox or map library. Coordinates are **meter-space from origin (0,0)**, no projections.

- **SceneLayer** (`lib/viewer/scene-layer.ts`) — interface abstracting scene/camera/canvas access
- **Ground planes** (`lib/viewer/ground-planes.ts`) — 3 merged geometries (roads, pavement, grass) for minimal draw calls
- **Grid**: 8x10 = 80 plots, 120m plot size, 16m roads, 6m pavement, 136m center-to-center (`lib/grid/grid-constants.ts`)
- **Building footprint**: 24x24 XZ, height varies by type (house ~8-15m, mid-rise ~30-60m, skyscraper ~80-150m, supertall ~200-400+m)
- **Plot interaction**: Invisible click-target meshes with raycasting (`components/PlotPopups.tsx`)
- **Environment**: PMREM gradient sky + animated cloud dome + HemisphereLight + 3-point directional + PCFSoftShadowMap (2048px) + FogExp2 + ACES tone mapping

### State Management (Zustand)

- `lib/stores/world-store.ts` — Three.js building objects, selection, drag, Convex sync
- `lib/stores/pipeline-store.ts` — Build pipeline step tracking
- `lib/stores/fp-store.ts` — First-person camera
- `lib/stores/car-store.ts` — Car movement input
- `lib/stores/chat-store.ts` — Chat messages

### Backend (Convex)

Tables defined in `convex/schema.ts`: `plots`, `buildings`, `cars`, `multiViewPreviews`, `cityState`, `agents`, `agentMessages`, `tickLog`, `elections`.

Key functions: `convex/pipeline.ts` (AI generation), `convex/buildings.ts` (CRUD), `convex/plots.ts` (claim/release), `convex/simulation/tick.ts` (simulation loop).

`convex/_generated/` is auto-generated — never edit.

### AI Building Pipeline

1. User prompt → claim plot
2. **Replicate** generates 2x2 elevation grid (Stable Diffusion) — `/api/pipeline/multiview`
3. **Bedrock Claude** vision analyzes images → generates Three.js procedural code — `/api/pipeline/geometry`
4. Code runs via sandboxed `new Function("THREE", code)` in `lib/viewer/procedural-loader.ts` (forbidden keyword filter)
5. Optional: **Iteration loop** — 4-angle screenshots sent to LLM for vision comparison → code refinement (`lib/hooks/useIteration.ts`)

**LLM provider chain** (`lib/llm/provider-chain.ts`): Mistral → OpenRouter Mistral → OpenRouter Claude. Falls through only on 429.

### Simulation Engine

Tick-based in `convex/simulation/`. Mayor makes decrees and budgets, citizens have traits/wealth/satisfaction, buildings generate taxed income. Metrics: happiness, crime, pollution, education, health. Elections every N ticks. City metrics computed in `lib/simulation/metrics.ts`.

### Key Patterns

- **Material normalization**: Ground uses `FrontSide` (correct winding). Buildings set materials per mesh.
- **Building drag**: Pure Three.js raycasting against ground plane, debounced Convex sync (200ms) — `lib/hooks/useBuildingDrag.ts`
- **Plot index**: `col + row * 8`
- **Path alias**: `@/*` maps to repo root
