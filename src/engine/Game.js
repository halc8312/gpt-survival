import { AssetLoader } from "./AssetLoader.js";
import { DataRegistry } from "./DataRegistry.js";
import { InputController } from "./InputController.js";
import { IsometricCamera } from "./IsometricCamera.js";
import { MapRenderer } from "./MapRenderer.js";
import { PlacementValidator } from "./PlacementValidator.js";
import { WorldGenerator } from "./WorldGenerator.js";
import { DebugOverlay } from "../ui/DebugOverlay.js";

const DATA_FILES = [
  { key: "gameConfig", path: "assets/data/core/game_config.json" },
  { key: "constants", path: "assets/data/core/constants.json" },
  { key: "tiles", path: "assets/data/world/tiles.json", collection: "tiles", recordKey: "tiles" },
  { key: "biomes", path: "assets/data/world/biomes.json", collection: "biomes", recordKey: "biomes" },
  { key: "resources", path: "assets/data/world/resources.json", collection: "resources", recordKey: "resources" },
  { key: "items", path: "assets/data/gameplay/items.json", collection: "items", recordKey: "items" },
  { key: "buildings", path: "assets/data/gameplay/buildings.json", collection: "buildings", recordKey: "buildings" },
  { key: "recipes", path: "assets/data/gameplay/recipes.json", collection: "recipes", recordKey: "recipes" },
  { key: "research", path: "assets/data/gameplay/research.json", collection: "research", recordKey: "research" },
  { key: "survivors", path: "assets/data/units/survivors.json", collection: "survivors", recordKey: "survivors" },
  { key: "drones", path: "assets/data/units/drones.json", collection: "drones", recordKey: "drones" },
  { key: "creatures", path: "assets/data/units/creatures.json", collection: "creatures", recordKey: "creatures" },
  { key: "dataManifest", path: "assets/manifests/data_manifest_mvp_v0.1.json" },
  { key: "worldDecorations", path: "assets/data/world/decorations.json", optional: true },
  { key: "mapGeneration", path: "assets/data/world/map_generation.json", optional: true },
  { key: "events", path: "assets/data/gameplay/events.json", optional: true },
  { key: "uiText", path: "assets/data/ui/ui_text.json", optional: true },
  { key: "tooltips", path: "assets/data/ui/tooltips.json", optional: true },
  { key: "tutorials", path: "assets/data/ui/tutorials.json", optional: true },
  { key: "difficulty", path: "assets/data/balance/difficulty_normal.json", optional: true },
  { key: "progression", path: "assets/data/balance/progression_mvp.json", optional: true },
  { key: "assetManifest", path: "assets/manifests/asset_manifest_mvp_v0.1.json", optional: true },
  { key: "assetStatus", path: "assets/manifests/asset_status_mvp_v0.1.json", optional: true },
  { key: "dataValidation", path: "assets/manifests/data_validation_report_v0.1.json", optional: true },
];

const BUILDING_HOTKEYS = new Map([
  ["1", "building_basic_shelter"],
  ["2", "building_storage_yard"],
  ["3", "building_manual_workbench"],
  ["4", "building_small_generator"],
]);
const DEFAULT_BUILDING_ID = BUILDING_HOTKEYS.values().next().value;

export class Game {
  constructor({ canvas, debugElement, errorPanel }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.debugOverlay = new DebugOverlay(debugElement);
    this.errorPanel = errorPanel;
    this.registry = new DataRegistry();
    this.assetLoader = new AssetLoader();
    this.camera = new IsometricCamera();
    this.worldGenerator = new WorldGenerator();
    this.input = new InputController({ canvas, camera: this.camera });
    this.world = null;
    this.mapRenderer = null;
    this.placementValidator = new PlacementValidator({
      occupancyProviders: [PlacementValidator.createResourceNodeBlocker()],
    });
    this.frameCount = 0;
    this.accumulator = 0;
    this.fps = 0;
    this.lastFrameAt = 0;
    this.started = false;
    this.viewport = { width: 1, height: 1, dpr: 1 };
    this.selection = {
      hoveredTile: null,
      selectedTile: null,
      hoveredResource: null,
      selectedResource: null,
      activeBuildingId: DEFAULT_BUILDING_ID,
      placement: null,
    };

    window.addEventListener("resize", () => this.resize());
  }

  async init() {
    this.resize();

    await this.registry.load(DATA_FILES);
    const validation = this.registry.validate();
    if (!validation.ok) {
      throw new Error(`Validation failed:\n- ${validation.errors.join("\n- ")}`);
    }

    await Promise.all([
      this.assetLoader.loadTileImages(this.registry.getAll("tiles")),
      this.assetLoader.loadResourceImages(this.registry.getAll("resources")),
    ]);

    const gameConfig = this.registry.getMeta("gameConfig");
    const mapGeneration = this.registry.getMeta("mapGeneration")?.mvp;
    const tileWidth = gameConfig.rendering.tileSize.width;
    const tileHeight = gameConfig.rendering.tileSize.height;
    const mapWidth = mapGeneration?.width ?? gameConfig.rendering.defaultMapSize.width;
    const mapHeight = mapGeneration?.height ?? gameConfig.rendering.defaultMapSize.height;
    const [centerX, centerY] = mapGeneration?.startingCenter ?? [Math.floor(mapWidth / 2), Math.floor(mapHeight / 2)];
    const seed = this.hashSeed(`${this.registry.getMeta("mapGeneration")?.defaultSeedPrefix ?? "STARDUST"}:${mapWidth}:${mapHeight}`);

    this.world = this.worldGenerator.generate({
      registry: this.registry,
      seed,
      width: mapWidth,
      height: mapHeight,
      center: { x: centerX, y: centerY },
    });

    this.mapRenderer = new MapRenderer({
      ctx: this.ctx,
      camera: this.camera,
      registry: this.registry,
      assetLoader: this.assetLoader,
      tileWidth,
      tileHeight,
    });

    const centerPoint = this.mapRenderer.tileToWorld(centerX, centerY);
    this.camera.centerOn(centerPoint.x, centerPoint.y - tileHeight * 2);
    this.errorPanel.classList.add("hidden");
    this.updateDebugOverlay();
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.lastFrameAt = performance.now();
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  loop(timestamp) {
    if (!this.started) {
      return;
    }

    const deltaSeconds = Math.min((timestamp - this.lastFrameAt) / 1000, 0.1);
    this.lastFrameAt = timestamp;

    this.update(deltaSeconds);
    this.render();
    requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }

  update(deltaSeconds) {
    this.frameCount += 1;
    this.accumulator += deltaSeconds;

    if (this.accumulator >= 1) {
      this.fps = Math.round(this.frameCount / this.accumulator);
      this.frameCount = 0;
      this.accumulator = 0;
    }

    this.input.update(deltaSeconds);
    this.selection.hoveredTile = this.mapRenderer.screenToTile(this.input.mouse.x, this.input.mouse.y, this.world);
    this.selection.hoveredResource = this.selection.hoveredTile
      ? this.world.resourceNodeGrid[this.selection.hoveredTile.y][this.selection.hoveredTile.x]
      : null;

    const buildingShortcut = this.input.consumeBuildingShortcut();
    if (buildingShortcut && BUILDING_HOTKEYS.has(buildingShortcut)) {
      this.selection.activeBuildingId = BUILDING_HOTKEYS.get(buildingShortcut);
    }

    this.selection.placement = this.getPlacementPreview();

    if (this.input.consumeClick()) {
      if (this.selection.hoveredResource) {
        this.selection.selectedResource = this.selection.hoveredResource;
      } else if (this.selection.hoveredTile) {
        this.selection.selectedTile = this.selection.hoveredTile;
        this.selection.selectedResource = null;
      }
    }

    this.updateDebugOverlay();
  }

  render() {
    this.ctx.setTransform(this.viewport.dpr, 0, 0, this.viewport.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.ctx.imageSmoothingEnabled = true;

    this.mapRenderer.render(this.world, this.selection);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    this.viewport = { width, height, dpr };
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.setViewport(width, height);
  }

  updateDebugOverlay() {
    const hovered = this.selection.hoveredTile;
    const selected = this.selection.selectedTile;
    const hoveredResource = this.selection.hoveredResource;
    const selectedResource = this.selection.selectedResource;
    const activeBuilding = this.registry.getBuilding(this.selection.activeBuildingId);
    const warnings = [...this.registry.validation.warnings, ...this.assetLoader.warnings];

    this.debugOverlay.render({
      fps: this.fps,
      loadedFiles: this.registry.loadedFiles.length,
      loadedImages: this.assetLoader.loadedImagesCount,
      validation: this.registry.validation.ok ? "ok" : "failed",
      camera: this.camera,
      mouse: this.input.mouse,
      hoveredTile: hovered,
      selectedTile: selected,
      hoveredResource,
      selectedResource,
      activeBuilding,
      placement: this.selection.placement,
      warningCount: warnings.length,
    });
  }

  getPlacementPreview() {
    const building = this.registry.getBuilding(this.selection.activeBuildingId);
    if (!building) {
      return null;
    }

    const origin = this.selection.hoveredTile
      ? { x: this.selection.hoveredTile.x, y: this.selection.hoveredTile.y }
      : null;
    return {
      buildingId: building.id,
      footprint: building.footprint,
      origin,
      ...this.placementValidator.validate({
        world: this.world,
        origin,
        footprint: building.footprint,
      }),
    };
  }

  hashSeed(input) {
    let hash = 2166136261;

    for (const char of input) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }
}
