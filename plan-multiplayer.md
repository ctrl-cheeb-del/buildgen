# CityPrompt — Multiplayer AI City Builder

## One-liner

A multiplayer build-battle game where players prompt AI to generate 3D buildings, vote on the best ones, and collectively grow a persistent city over time.

---

## Core Concept

Players join a lobby and each get assigned a plot on a 5×4 grid (20 plots, 20 players). A theme or constraint is announced ("build a skyscraper", "brutalist community center", "something weird"). Everyone writes a prompt simultaneously under time pressure. The AI pipeline generates a 3D building for each player. Buildings are revealed one by one, everyone votes, a winner is crowned. The camera zooms out — you've just built a block of the city. That block is saved permanently. Next game, the next 5×4 grid spawns adjacent to it. Over days and weeks, an entire city emerges from collective play.

---

## The Generation Pipeline

This is the core tech that turns a text prompt into a 3D building on the map.

### Step 1: Prompt → Architectural Blueprints (Nano Banana Pro)

- Player's text prompt + round constraints + plot dimensions get combined into a structured image generation prompt
- Nano Banana generates **multiple controlled views**: front elevation, side elevation, and top-down floor plan (minimum 3 views)
- These aren't artistic renders — they need to be clean, blueprint-style images that Codestral can actually parse
- Prompt engineering here is critical: force consistent style, scale indicators, and view labelling

### Step 2: Blueprints → Three.js Code (Codestral via Mistral Agents API)

- Codestral receives all blueprint views + a structured spec (plot dimensions, max height, building type)
- It writes procedural Three.js geometry code — combining primitives (boxes, cylinders, planes) into a building
- **Key decision: component library vs freeform.** A predefined set of building components (wall segments, window types, door types, roof types, floor slabs) that Codestral composes will produce far better results than unconstrained geometry generation
- Output is executable JS that creates a Three.js Group/Object3D

### Step 3: Visual QA Loop (Pixtral Large via Mistral Agents API)

- The generated Three.js code runs in a headless renderer (Puppeteer or server-side Three.js with headless-gl)
- Screenshots are taken from **camera angles matching the original blueprint views** (front, side, top)
- Pixtral receives: original Nano Banana blueprints + rendered screenshots side by side
- Pixtral evaluates against a **structured rubric**, not vibes:
  - Floor count match (yes/no)
  - Footprint shape match (1-5)
  - Major features present — windows, doors, roof type (1-5)
  - Scale/proportion accuracy (1-5)
  - Overall fidelity (1-5)
- If scores fall below threshold → Pixtral generates structured correction feedback → sent back to Codestral → new code → re-render → re-evaluate
- **Max iterations cap** (e.g. 8 cycles) to prevent infinite loops — after cap, ship whatever you have
- Convergence target: all rubric scores ≥ 3

### Step 4: Place on Map

- Final Three.js model gets positioned in the player's assigned plot on the Mapbox grid
- Coordinate system alignment: the grid defines world-space positions, each plot has known dimensions
- Building gets tagged with player info (X handle, round number, score)

### Agent Architecture (Mistral Agents API)

All three Mistral models run as agents with tool use:

- **Orchestrator Agent (Mistral Large)** — receives player prompt + game context, writes the structured spec for Nano Banana, manages the overall flow, enforces constraints
- **Builder Agent (Codestral)** — has tools: `generate_geometry`, `render_screenshot`, `get_feedback`. Writes and iterates on Three.js code autonomously
- **QA Agent (Pixtral Large)** — has tools: `compare_views`, `score_building`, `request_revision`. Evaluates renders and sends structured corrections back to Builder Agent

The agents communicate through the Agents API — this is a genuine multi-agent loop, not a linear chain.

---

## The Game Layer

### Lobby & Matchmaking

- Players log in via X (Twitter) OAuth
- Join a public lobby or create a private one with a share link
- Lobby fills up to 20 players (one per plot in the 5×4 grid)
- If fewer than 20 human players, **AI players fill remaining slots** — these are bot players using pre-tuned prompts or random creative prompts, labelled as AI in the UI
- Game starts when lobby is full or host triggers start

### Round Flow

1. **Theme announcement** (5 seconds) — the round constraint appears ("residential tower", "public library", "something from the year 3000")
2. **Prompting phase** (45-60 seconds) — everyone writes their building prompt. Timer visible. Submit early or get auto-submitted at deadline
3. **Generation phase** (~60-120 seconds) — all buildings generate simultaneously. UI shows progress per player ("Oliver: iteration 3/8", "Sarah: iteration 6/8"). This is the tension-building moment
4. **Reveal phase** (~60-90 seconds) — camera flies to each plot one by one, dramatic zoom onto each building, player's X handle displayed. 5 seconds per building
5. **Voting phase** (30 seconds) — everyone rates each building 1-5 (can't vote for your own). Or simpler: everyone picks their top 3
6. **Results** — winner announced, points awarded, leaderboard updates
7. **Zoom out** — camera pulls back to show the full block taking shape

### Scoring

- Vote-based points per round (e.g. 1st = 5pts, 2nd = 3pts, 3rd = 1pt)
- Bonus: "neighborhood award" if your building looks cohesive next to its neighbors (voted separately or by the orchestrator agent)
- End-of-game MVP

### AI Players

- Fill empty slots so you can always play even if only 3 humans are online
- Labelled clearly as AI in the UI (different badge/icon vs human X profile)
- Use varied prompt strategies — some conservative, some wild — to keep rounds interesting
- Their buildings still get placed and persist in the city

---

## The Persistent City

### How It Grows

- The map starts empty — a flat plane or minimal terrain
- Each completed game fills one 5×4 block (20 buildings)
- The next game's grid spawns **adjacent** to the previous one — the city grows outward organically
- Growth direction could be: spiral outward from center, linear expansion, or player-voted ("expand north or east?")
- All buildings are permanently saved with metadata: player X handle, prompt used, round theme, vote score, timestamp

### City Map

- Anyone can visit the city at any time (no login required to browse)
- Fly around the full Mapbox 3D view, see every building ever created
- Click any building to see: who built it, what prompt they used, what score it got, what round/game it was from
- Filter/highlight by player, by date, by score, by theme

### Ownership & Identity

- Your X profile pic / handle appears above your buildings
- Profile page: "Oliver has built 47 buildings across 12 games. Top score: 4.8. Favorite style: brutalist"
- Shareable links: "Check out my building" / "Check out our city"

---

## Tech Stack

### Frontend
- **Next.js** — app framework
- **Mapbox GL JS** — 3D map rendering, camera controls, fly-to animations
- **Three.js** — custom layer in Mapbox for generated building models
- **Tailwind CSS** — UI styling

### Backend / Real-time
- **Convex** — game state, lobbies, player data, building storage, real-time subscriptions (replaces need for raw websockets — Convex reactivity handles live updates natively)
- **Convex actions** — server-side calls to Mistral APIs, Nano Banana, headless rendering

### AI Pipeline
- **Nano Banana Pro** — blueprint image generation
- **Mistral Agents API** — orchestrator (Mistral Large), builder (Codestral), QA (Pixtral Large)
- **Headless rendering** — Puppeteer or server-side Three.js for screenshot generation during QA loop

### Auth
- **X (Twitter) OAuth** — social login, display handle/avatar in-game
- **Clerk** (if needed for session management) or handle auth directly through Convex

### Storage & Persistence
- **Convex** — all game data, building metadata, city state
- **Convex file storage** — generated building models (Three.js JSON or serialized geometry), blueprint images, screenshots

---

## Data Model (Convex)

```
cities
  - id
  - name (generated)
  - created_at
  - total_buildings
  - grid_cursor (where the next 5×4 block spawns)

games
  - id
  - city_id
  - grid_origin (x, y position of this game's 5×4 block)
  - theme/constraint
  - status (lobby / prompting / generating / revealing / voting / complete)
  - created_at
  - completed_at

players
  - id
  - x_handle
  - x_avatar_url
  - total_games
  - total_wins
  - buildings_created

game_players
  - game_id
  - player_id
  - is_ai (boolean)
  - plot_position (x, y within the 5×4 grid)
  - prompt_text
  - score
  - votes_received

buildings
  - id
  - game_id
  - player_id
  - plot_position (absolute city coordinates)
  - prompt_text
  - theme
  - threejs_model (file reference — serialized geometry/scene JSON)
  - blueprint_images (file references)
  - qa_iterations (number of QA cycles it took)
  - final_qa_scores (structured rubric scores)
  - vote_score
  - created_at

votes
  - game_id
  - voter_player_id
  - target_player_id
  - score (1-5 or rank)
```

---

## MVP Scope (Hackathon)

What you need to demo. Nothing else.

### Must Have
- [ ] Single lobby, 4-6 players (pad with AI players to fill grid)
- [ ] Reduced grid for demo — 2×3 or 3×3 instead of 5×4
- [ ] One full round flow: theme → prompt → generate → reveal → vote → winner
- [ ] The generation pipeline working end-to-end (Nano Banana → Codestral → Pixtral QA → Three.js model)
- [ ] Buildings placed on a Mapbox 3D view in the correct plot positions
- [ ] X OAuth login so player handles show on buildings
- [ ] Basic voting UI
- [ ] Camera fly-through for reveal phase

### Should Have (if time allows)
- [ ] 2-3 rounds in a single game to show the grid filling up
- [ ] Progressive rendering (show rough model first, refine in real-time)
- [ ] Agent trace sidebar showing the Mistral agents talking to each other
- [ ] Persistent city across multiple games

### Cut for Hackathon
- [ ] Interior design / Gaussian splats (post-hackathon feature)
- [ ] Leaderboards and player profiles
- [ ] Spectator mode
- [ ] City naming / shareable fly-through URLs
- [ ] Neighborhood cohesion scoring
- [ ] World Labs integration

---

## Workstream Split (3 People)

### Workstream 1: "The Architect" — AI Generation Pipeline
- Nano Banana prompt engineering for clean multi-view blueprints
- Mistral Agents API setup — orchestrator, builder, QA agents with tool definitions
- Codestral Three.js code generation + component library
- Headless rendering for QA screenshots
- Pixtral comparison logic + structured rubric scoring
- The iterative QA loop end-to-end
- **Deliverable:** function that takes (prompt, plot_dimensions) → returns Three.js model

### Workstream 2: "The Game Master" — Multiplayer & Game Logic
- Convex schema, mutations, queries for all game state
- Lobby system — create, join, fill with AI players
- Round state machine (lobby → prompting → generating → revealing → voting → complete)
- Real-time subscriptions so all players see the same state
- Voting logic and scoring
- AI player prompt generation
- X OAuth integration
- **Deliverable:** full game loop working with placeholder buildings (cubes), ready to plug in real models

### Workstream 3: "The Urban Planner" — Frontend & Map
- Next.js app shell, routing, UI
- Mapbox 3D view with the plot grid overlay
- Three.js custom layer for placing generated buildings at plot coordinates
- Camera system — fly-to animations for reveal phase, zoom out for city view
- Prompting UI (text input + timer)
- Voting UI
- Building info popups (click to see player, prompt, score)
- **Deliverable:** the entire visual experience, ready to receive real buildings from Workstream 1 and real game state from Workstream 2

### Integration Contract

The three workstreams connect at two interfaces:

1. **Workstream 1 ↔ Workstream 2:** Workstream 2 calls Workstream 1's generation function via a Convex action. Input: player prompt + plot dimensions. Output: serialized Three.js model + metadata. Workstream 2 stores the result and updates game state.

2. **Workstream 2 ↔ Workstream 3:** Workstream 3 subscribes to Convex queries for game state. All UI is reactive — when game state changes (new phase, new building ready, votes in), the frontend updates automatically.

**Agree on these interfaces on day one. Then everyone can work in parallel.**

---

## Post-Hackathon Roadmap

If this thing has legs after the hackathon:

1. **Persistent growing city** — the full vision of cities expanding game by game
2. **Interior design mode** — click into a building, generate interior layouts, Gaussian splat walkthrough (World Labs)
3. **Themed cities** — "cyberpunk city", "medieval town", "solarpunk utopia" — each city has a style constraint
4. **Spectator mode + live streaming** — watch games in progress
5. **Building marketplace** — trade or showcase your best buildings
6. **Real geography mode** — drop the game grid onto actual city plots, build on real land
7. **Mobile app** — prompt on your phone, watch the city grow