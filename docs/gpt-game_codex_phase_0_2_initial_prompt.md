# Codex Initial Implementation Prompt / Phase 0–2

Project: gpt-game  
Working title: 星屑コロニー / Stardust Colony  
Target: GitHub Pages browser game MVP  
Scope of this task: Phase 0–2 only

---

## Files I will provide

Please assume the following ZIP files are available in the repository root or will be uploaded/extracted into the repository:

- `gpt-game_mvp_asset_pack_v0.1.zip`
- `gpt-game_mvp_data_pack_v0.1.zip`

Extract them so the repository contains:

```txt
assets/
  images/
    tiles/
    resources/
    buildings/
    items/
    units/
    drones/
    creatures/
    ui/
    effects/
  manifests/
    asset_manifest_mvp_v0.1.json
    asset_status_mvp_v0.1.json
    data_manifest_mvp_v0.1.json
    data_validation_report_v0.1.json

assets/data/
  core/
  world/
  gameplay/
  units/
  ui/
  balance/
```

---

## Overall instruction

Implement only the first playable technical foundation.

Do not implement production chains, power simulation, research trees, survivor AI, events, combat, or save/load yet.  
Those are later phases.

The goal is to make the project boot in a browser, load data, load assets, display a 64×64 isometric terrain map, and allow basic camera movement and tile selection.

---

# Phase 0: Project Setup

## Goal

Create a GitHub Pages-compatible static web game project.

## Requirements

Use a simple static structure. Prefer plain JavaScript unless the repository is already configured for TypeScript.

Recommended structure:

```txt
index.html
src/
  main.js
  engine/
    Game.js
    AssetLoader.js
    DataRegistry.js
    IsometricCamera.js
    InputController.js
    MapRenderer.js
    WorldGenerator.js
  ui/
    DebugOverlay.js
assets/
  data/
  images/
  manifests/
styles/
  main.css
README.md
```

If you choose a different structure, keep it simple and document it.

## Must implement

- `index.html`
- CSS reset/basic layout
- Canvas that fills the browser window
- Main game loop using `requestAnimationFrame`
- Browser-safe module loading
- No server dependency
- Works by opening through GitHub Pages
- Clear error display if initialization fails

## Acceptance criteria

- The page loads without console errors.
- A canvas is visible.
- The game loop runs.
- FPS or frame count appears in a small debug overlay.
- The project can be served locally by a simple static server.

---

# Phase 1: Data and Asset Loading

## Goal

Load the MVP JSON data and image assets from the generated packs.

## Data files to load first

Load at least:

```txt
assets/data/core/game_config.json
assets/data/core/constants.json
assets/data/world/tiles.json
assets/data/world/biomes.json
assets/data/world/resources.json
assets/data/gameplay/items.json
assets/data/gameplay/buildings.json
assets/data/gameplay/recipes.json
assets/data/gameplay/research.json
assets/data/units/survivors.json
assets/data/units/drones.json
assets/data/units/creatures.json
assets/manifests/data_manifest_mvp_v0.1.json
```

Optional but preferred:

```txt
assets/data/world/decorations.json
assets/data/world/map_generation.json
assets/data/gameplay/events.json
assets/data/ui/ui_text.json
assets/data/ui/tooltips.json
assets/data/ui/tutorials.json
assets/data/balance/difficulty_normal.json
assets/data/balance/progression_mvp.json
assets/manifests/asset_manifest_mvp_v0.1.json
```

## Implement `DataRegistry`

Create a central registry that stores data by ID.

Minimum API:

```js
registry.getItem(id)
registry.getTile(id)
registry.getBiome(id)
registry.getResource(id)
registry.getBuilding(id)
registry.getRecipe(id)
registry.getResearch(id)
registry.getCreature(id)
registry.getAll(type)
registry.has(type, id)
```

The exact implementation can differ, but it must be easy to look up records by ID.

## Validation

At startup, validate:

- Item IDs are unique.
- Tile IDs are unique.
- Building IDs are unique.
- Recipe IDs are unique.
- Research IDs are unique.
- Recipe inputs/outputs reference existing item IDs.
- Recipe `buildingId` references existing building IDs.
- Building `buildCost` references existing item IDs.
- Building `unlockedBy` references an existing research ID, except special values such as `starting_core`.
- Resource drops reference existing item IDs.
- Tile sprite paths exist or report missing asset warnings.

If validation fails, show a clear error panel in the browser.

Warnings may be shown in the debug overlay, but hard ID errors should stop the game from starting.

## Asset loading

Load terrain tile images used by `tiles.json`:

```txt
assets/images/tiles/*.png
```

Implement a fallback placeholder if an image fails to load.

## Acceptance criteria

- JSON files load successfully.
- Registry can retrieve records by ID.
- Validation result is shown in debug overlay.
- Missing or invalid data is reported clearly.
- Terrain tile images are loaded and ready for rendering.

---

# Phase 2: Isometric Map Display

## Goal

Generate and render a 64×64 isometric map using `tiles.json`.

## Map generation

Use `assets/data/world/map_generation.json` if helpful.

Minimum implementation:

- Generate a 64×64 grid.
- Use these terrain IDs:
  - `tile_plain_soil`
  - `tile_crash_scorched`
  - `tile_grass_sparse`
  - `tile_rocky_ground`
  - `tile_bare_rock`
  - `tile_gravel_slope`
  - `tile_glow_moss`
  - `tile_forest_floor`
  - `tile_root_tangle`
  - `tile_shallow_water`
  - `tile_marsh_mud`
  - `tile_reed_bed`
- Place crash/scorched tiles near map center.
- Make the center area mostly buildable.
- Add rocky, glow forest, and marsh regions farther from center.
- Use deterministic seeded generation if easy; otherwise a deterministic pseudo-random function is acceptable.

## Rendering

Render terrain tiles as isometric diamonds.

Use the project config:

```txt
tile width: 64
tile height: 32
map width: 64
map height: 64
```

Tile-to-screen conversion should be similar to:

```js
screenX = (x - y) * tileWidth / 2
screenY = (x + y) * tileHeight / 2
```

Render in correct back-to-front order.

## Camera

Implement:

- WASD or arrow key pan
- Mouse drag pan
- Mouse wheel zoom
- Zoom clamp, for example `0.5` to `2.5`
- Initial camera centered on crash site

## Tile selection

Implement:

- Mouse hover tile coordinate
- Click to select tile
- Selected tile outline
- Hover tile outline
- Debug overlay showing:
  - mouse screen position
  - world tile coordinate
  - selected tile ID
  - tile buildable flag
  - biome ID if available

Accurate picking matters. Use inverse isometric transform and test carefully.

## Acceptance criteria

- 64×64 map renders.
- Tile sprites from `assets/images/tiles` are used.
- Camera movement works.
- Zoom works.
- Hover tile and selected tile are visibly highlighted.
- Clicking a tile reports correct tile coordinate and tile ID.
- Scorched crash zone appears near the center.
- There are visibly different terrain regions.
- No production/building/research implementation yet.

---

# Debug Overlay Requirements

Show a small overlay with:

```txt
FPS
Loaded data files count
Loaded images count
Validation status
Camera x/y/zoom
Hovered tile coordinate
Selected tile coordinate
Selected tile ID
Warnings count
```

This overlay can be simple text.

---

# Non-goals for this task

Do not implement yet:

- Building placement
- Inventory
- Resource harvesting
- Production recipes
- Power simulation
- Research progression
- Survivor AI
- Drone AI
- Creature AI
- Events
- Save/load
- Audio
- Final UI styling
- Mobile optimization

Do not refactor the data pack unless there is a blocking error.  
If data changes are needed, explain the reason clearly.

---

# Deliverables

Please produce:

1. Working static web project.
2. Clear file structure.
3. README with:
   - how to run locally
   - how to deploy to GitHub Pages
   - what is implemented
   - known limitations
4. Code comments for the isometric transform and tile picking.
5. No console errors on startup.
6. A short summary of what was done and what should be implemented in Phase 3.

---

# Phase 3 Preview, not part of this task

The next task after this will be:

- Resource node placement
- Display resource nodes over terrain
- Basic building ghost preview
- Building placement validation

Do not implement Phase 3 now. Prepare the code so Phase 3 can be added cleanly.
