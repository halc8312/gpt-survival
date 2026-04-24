import { AssetLoader } from "./AssetLoader.js";
import { DataRegistry } from "./DataRegistry.js";
import { InputController } from "./InputController.js";
import { IsometricCamera } from "./IsometricCamera.js";
import { MapRenderer } from "./MapRenderer.js";
import { PlacementValidator } from "./PlacementValidator.js";
import { WorldGenerator } from "./WorldGenerator.js";
import { BuildToolbar } from "../ui/BuildToolbar.js";
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
  ["5", "building_basic_miner"],
  ["6", "building_smelter_mk1"],
  ["7", "building_assembler_mk1"],
  ["8", "building_research_station"],
]);
const DEFAULT_BUILDING_ID = BUILDING_HOTKEYS.values().next().value;
const STARTER_INVENTORY = {
  scrap_metal: 120,
  stone: 80,
  plant_fiber: 60,
  raw_food: 12,
  dirty_water: 12,
  basic_circuit: 8,
  battery_cell: 4,
  recovered_wire: 12,
  iron_plate: 20,
  iron_rod: 12,
  composite_panel: 8,
  gear: 8,
  machine_parts: 4,
  fuel_cell: 4,
  data_chip: 1,
  research_data: 20,
};

export class Game {
  constructor({ canvas, debugElement, buildControlsElement, errorPanel }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.debugOverlay = new DebugOverlay(debugElement);
    this.buildToolbar = buildControlsElement
      ? new BuildToolbar(buildControlsElement, {
          onSelectBuilding: (buildingId) => this.activateBuildMode(buildingId),
          onCancelBuild: () => this.cancelBuildMode(),
          onConfirmBuild: () => this.confirmPlacement(),
        })
      : null;
    this.errorPanel = errorPanel;
    this.registry = new DataRegistry();
    this.assetLoader = new AssetLoader();
    this.camera = new IsometricCamera();
    this.worldGenerator = new WorldGenerator();
    this.input = new InputController({ canvas, camera: this.camera });
    this.world = null;
    this.mapRenderer = null;
    this.placementValidator = new PlacementValidator({
      occupancyProviders: [
        PlacementValidator.createResourceNodeBlocker(),
        PlacementValidator.createPlacedBuildingBlocker(),
      ],
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
      hoveredBuilding: null,
      selectedBuilding: null,
      activeBuildingId: DEFAULT_BUILDING_ID,
      buildMode: false,
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
      this.assetLoader.loadBuildingImages(this.registry.getAll("buildings")),
    ]);

    const gameConfig = this.registry.getMeta("gameConfig");
    const mapGeneration = this.registry.getMeta("mapGeneration")?.mvp;
    const tileWidth = gameConfig.rendering.tileSize.width;
    const tileHeight = gameConfig.rendering.tileSize.height;
    const mapWidth = mapGeneration?.width ?? gameConfig.rendering.defaultMapSize.width;
    const mapHeight = mapGeneration?.height ?? gameConfig.rendering.defaultMapSize.height;
    const [centerX, centerY] = mapGeneration?.startingCenter ?? [Math.floor(mapWidth / 2), Math.floor(mapHeight / 2)];
    const seed = this.hashSeed(`${this.registry.getMeta("mapGeneration")?.defaultSeedPrefix ?? "STARDUST"}:${mapWidth}:${mapHeight}`);
    const crashCore = this.registry.getBuilding("building_crash_core");
    const crashCoreOrigin = crashCore ? this.getCenteredBuildingOrigin(crashCore, { x: centerX, y: centerY }) : null;

    this.world = this.worldGenerator.generate({
      registry: this.registry,
      seed,
      width: mapWidth,
      height: mapHeight,
      center: { x: centerX, y: centerY },
      reservedFootprints: crashCore && crashCoreOrigin ? [{ origin: crashCoreOrigin, footprint: crashCore.footprint }] : [],
    });
    this.world.buildings = [];
    this.world.buildingCounts = {};
    this.world.buildingGrid = this.createGrid(this.world.width, this.world.height);
    this.world.inventory = { ...STARTER_INVENTORY };
    this.placeInitialBuilding("building_crash_core", crashCoreOrigin);
    this.buildToolbar?.setOptions(
      Array.from(BUILDING_HOTKEYS.entries(), ([shortcut, buildingId]) => ({
        shortcut,
        buildingId,
        building: this.registry.getBuilding(buildingId),
      })),
    );

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
    this.updateUi();
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
    this.selection.hoveredBuilding = this.selection.hoveredTile
      ? this.world.buildingGrid[this.selection.hoveredTile.y][this.selection.hoveredTile.x]
      : null;

    const buildingShortcut = this.input.consumeBuildingShortcut();
    if (buildingShortcut && BUILDING_HOTKEYS.has(buildingShortcut)) {
      this.activateBuildMode(BUILDING_HOTKEYS.get(buildingShortcut));
    }

    if (this.input.consumeCancelBuild()) {
      this.cancelBuildMode();
    }

    this.selection.placement = this.getPlacementPreview();

    if (this.input.consumePlacementConfirm() && this.confirmPlacement()) {
      return;
    }

    if (this.input.consumeClick()) {
      if (this.selection.hoveredResource) {
        this.selection.selectedResource = this.selection.hoveredResource;
        this.selection.selectedBuilding = null;
      } else if (this.selection.buildMode && this.tryPlaceActiveBuilding()) {
        this.selection.selectedResource = null;
      } else if (this.selection.hoveredTile) {
        this.selection.selectedTile = this.selection.hoveredTile;
        this.selection.selectedResource = null;
        this.selection.selectedBuilding = this.selection.hoveredBuilding;
      }
    }

    this.updateUi();
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

  updateUi() {
    this.buildToolbar?.render({
      activeBuildingId: this.selection.activeBuildingId,
      buildMode: this.selection.buildMode,
      placementValid: Boolean(this.selection.placement?.valid),
    });
    this.updateDebugOverlay();
  }

  updateDebugOverlay() {
    const hovered = this.selection.hoveredTile;
    const selected = this.selection.selectedTile;
    const hoveredResource = this.selection.hoveredResource;
    const selectedResource = this.selection.selectedResource;
    const hoveredBuilding = this.selection.hoveredBuilding;
    const selectedBuilding = this.selection.selectedBuilding;
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
      hoveredBuilding,
      selectedBuilding,
      activeBuilding: this.selection.buildMode ? activeBuilding : null,
      placement: this.selection.placement,
      buildingsCount: this.world?.buildings?.length ?? 0,
      inventorySummary: this.formatInventorySummary(),
      warningCount: warnings.length,
    });
  }

  getPlacementPreview() {
    if (!this.selection.buildMode) {
      return null;
    }

    const building = this.registry.getBuilding(this.selection.activeBuildingId);
    if (!building) {
      return null;
    }

    const origin = this.selection.hoveredTile
      ? { x: this.selection.hoveredTile.x, y: this.selection.hoveredTile.y }
      : null;
    const placement = {
      buildingId: building.id,
      footprint: building.footprint,
      buildCost: building.buildCost ?? {},
      origin,
      ...this.placementValidator.validate({
        world: this.world,
        origin,
        footprint: building.footprint,
      }),
    };

    const affordability = this.validateInventory(building.buildCost);
    if (placement.valid && !affordability.ok) {
      placement.valid = false;
      placement.reason = `insufficient_resources:${affordability.missing.join(",")}`;
    }

    return placement;
  }

  hashSeed(input) {
    let hash = 2166136261;

    for (const char of input) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  createGrid(width, height) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  }

  placeInitialBuilding(buildingId, origin = null) {
    const building = this.registry.getBuilding(buildingId);
    if (!building) {
      return null;
    }

    const centeredOrigin = origin ?? this.getCenteredBuildingOrigin(building, this.world.center);
    const placement = this.placementValidator.validate({
      world: this.world,
      origin: centeredOrigin,
      footprint: building.footprint,
    });
    if (!placement.valid) {
      throw new Error(
        `Failed to place initial building at reserved centered origin: ${buildingId} (${placement.reason ?? "unknown"})`,
      );
    }

    return this.placeBuildingInstance({ building, origin: centeredOrigin, consumeInventory: false });
  }

  getCenteredBuildingOrigin(building, center) {
    return {
      x: center.x - Math.floor(building.footprint.width / 2),
      y: center.y - Math.floor(building.footprint.height / 2),
    };
  }

  tryPlaceActiveBuilding() {
    const placement = this.selection.placement;
    if (!placement?.valid || !placement.origin) {
      return false;
    }

    const building = this.registry.getBuilding(placement.buildingId);
    if (!building) {
      return false;
    }

    const instance = this.placeBuildingInstance({
      building,
      origin: placement.origin,
      consumeInventory: true,
    });

    this.selection.selectedTile = this.world.tiles[placement.origin.y][placement.origin.x];
    this.selection.selectedBuilding = instance;
    this.selection.selectedResource = null;
    this.selection.hoveredBuilding = instance;
    this.selection.placement = this.getPlacementPreview();
    return true;
  }

  activateBuildMode(buildingId) {
    if (!this.registry.getBuilding(buildingId)) {
      return;
    }

    this.selection.activeBuildingId = buildingId;
    this.selection.buildMode = true;
    this.selection.placement = this.getPlacementPreview();
    this.updateUi();
  }

  cancelBuildMode() {
    this.selection.buildMode = false;
    this.selection.placement = null;
    this.updateUi();
  }

  confirmPlacement() {
    const placed = this.tryPlaceActiveBuilding();
    this.updateUi();
    return placed;
  }

  placeBuildingInstance({ building, origin, consumeInventory }) {
    if (consumeInventory) {
      this.consumeInventory(building.buildCost);
    }

    const occupiedTiles = this.collectOccupiedTiles(origin, building.footprint);
    const lastOccupiedTile = occupiedTiles[occupiedTiles.length - 1] ?? origin;
    const instanceIndex = (this.world.buildingCounts[building.id] ?? 0) + 1;
    const instance = {
      instanceId: `${building.id}_${String(instanceIndex).padStart(3, "0")}`,
      buildingId: building.id,
      x: origin.x,
      y: origin.y,
      footprint: { ...building.footprint },
      durability: building.durability ?? 0,
      powered: building.id === "building_crash_core",
      sprite: building.sprite,
      occupiedTiles,
      sortKey: lastOccupiedTile.x + lastOccupiedTile.y,
    };

    this.world.buildings.push(instance);
    this.world.buildingCounts[building.id] = instanceIndex;
    this.world.buildings.sort((left, right) => {
      if (left.sortKey !== right.sortKey) {
        return left.sortKey - right.sortKey;
      }
      if (left.y !== right.y) {
        return left.y - right.y;
      }
      if (left.x !== right.x) {
        return left.x - right.x;
      }
      return left.instanceId.localeCompare(right.instanceId);
    });

    for (const tile of occupiedTiles) {
      this.world.buildingGrid[tile.y][tile.x] = instance;
    }

    return instance;
  }

  collectOccupiedTiles(origin, footprint) {
    const tiles = [];

    for (let offsetY = 0; offsetY < footprint.height; offsetY += 1) {
      for (let offsetX = 0; offsetX < footprint.width; offsetX += 1) {
        tiles.push({ x: origin.x + offsetX, y: origin.y + offsetY });
      }
    }

    return tiles;
  }

  validateInventory(buildCost = {}) {
    const missing = Object.entries(buildCost)
      .filter(([itemId, amount]) => (this.world?.inventory?.[itemId] ?? 0) < amount)
      .map(([itemId]) => itemId);

    return {
      ok: missing.length === 0,
      missing,
    };
  }

  consumeInventory(buildCost = {}) {
    for (const [itemId, amount] of Object.entries(buildCost)) {
      this.world.inventory[itemId] = Math.max(0, (this.world.inventory[itemId] ?? 0) - amount);
    }
  }

  formatInventorySummary() {
    const inventory = this.world?.inventory;
    if (!inventory) {
      return "—";
    }

    return Object.entries(inventory)
      .filter(([, amount]) => amount > 0)
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([itemId, amount]) => `${itemId}:${amount}`)
      .join(", ");
  }
}
