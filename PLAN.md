# CityPrompt — Consolidated Plan

## Current Status: Solo Grid System — All Steps Complete

## Solo Grid System (Completed)
- [x] Step 1: Grid geometry engine — `grid-constants.ts` + `grid-geometry.ts` created
- [x] Step 2: Convex schema — `plots` + `buildings` tables, `plots.ts` + `buildings.ts` mutations/queries deployed
- [x] Step 3: Plot grid on Mapbox — `plot-layer.ts` created, `MapCanvas.tsx` updated (blank style, grid origin, GeoJSON layers)
- [x] Step 4: Convex ↔ rendering sync — `useGridSync.ts` hook created, `world-store.ts` simplified (removed localStorage)
- [x] Step 5: Auto-assignment pipeline — `PromptBar.tsx` (no lng/lat, plot status), `usePipeline.ts` (Convex output), `page.tsx` (wired together, no ControlPanel)
- [x] Step 6: Geometry route prompt — added 30m x 30m footprint constraint

## Architecture

```
User types prompt → claimNextEmpty() → pipeline (multiview + geometry) → createBuilding() → markComplete()
                                                                              ↓
                                                              Convex subscription (useGridSync)
                                                                              ↓
                                                              loadProceduralGeometry → Three.js scene
                                                              generateGridGeoJSON → Mapbox GeoJSON layers
```

## Grid Layout
- 4x5 grid = 20 plots
- 30m x 30m plot footprint, 8m roads, 3m pavements
- Flat blank map (no real-world data)
- Buildings auto-assign to next empty plot

## Key Files
| File | Purpose |
|------|---------|
| `frontend/lib/grid/grid-constants.ts` | Grid dimensions, plot sizes, origin |
| `frontend/lib/grid/grid-geometry.ts` | Plot math, GeoJSON generation, auto-assignment |
| `frontend/lib/grid/plot-layer.ts` | Mapbox GeoJSON layers for roads/pavements/plots |
| `frontend/convex/schema.ts` | Convex schema: plots + buildings tables |
| `frontend/convex/plots.ts` | Plot state mutations + queries |
| `frontend/convex/buildings.ts` | Building storage mutations + queries |
| `frontend/lib/hooks/useGridSync.ts` | Convex → Zustand → Three.js bridge |
| `frontend/lib/hooks/usePipeline.ts` | Pipeline: auto-assign plot, output to Convex |
| `frontend/components/MapCanvas.tsx` | Blank map style, grid GeoJSON, Three.js layer |
| `frontend/components/PromptBar.tsx` | Input with plot assignment display |
| `frontend/app/page.tsx` | Main page wiring useGridSync + usePipeline |

## Future: Multiplayer
- Add cities/games/players tables to Convex
- Multiple grids per city
- Real-time collaboration via Convex subscriptions
