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
  ["9", "building_solar_panel_mk1"],
  ["0", "building_battery_bank_mk1"],
]);
const DEFAULT_BUILDING_ID = BUILDING_HOTKEYS.values().next().value;
const LABEL_PRIORITY = ["ja", "en"];
const DEFAULT_POWER_RECALCULATION_SECONDS = 0.25;
// Allows a tiny absolute tolerance when comparing per-tick energy budgets to avoid
// floating-point jitter from flipping buildings between powered/unpowered states.
const ENERGY_COMPARISON_EPSILON = 1e-9;
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
          onHarvest: () => this.harvestSelectedResource(),
          onStartProduction: () => this.startSelectedBuildingProduction(),
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
    this.powerAccumulator = 0;
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
      buildTargetTile: null,
      placement: null,
    };
    this.statusMessage = "";

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
    this.world.lastHarvestResult = null;
    this.world.lastProductionResult = null;
    this.world.time = this.createInitialTimeState();
    this.world.power = this.createInitialPowerState();
    this.placeInitialBuilding("building_crash_core", crashCoreOrigin);
    this.recalculatePowerState(0);
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

    if (this.selection.buildMode && !this.input.requiresExplicitPlacementForCurrentInteraction()) {
      this.selection.buildTargetTile = this.selection.hoveredTile;
    }

    this.selection.placement = this.getPlacementPreview();

    if (this.input.consumePlacementConfirm() && this.confirmPlacement()) {
      return;
    }

    if (this.input.consumeHarvest()) {
      this.harvestSelectedResource();
    }

    const recipeCycleDirection = this.input.consumeRecipeCycle();
    if (recipeCycleDirection !== 0) {
      this.cycleSelectedBuildingRecipe(recipeCycleDirection);
    }

    if (this.input.consumeProductionStart()) {
      this.startSelectedBuildingProduction();
    }

    const click = this.input.consumeClick();
    if (click) {
      if (this.selection.buildMode) {
        if (!this.input.requiresExplicitTouchPlacement(click.pointerType) && this.tryPlaceActiveBuilding()) {
          this.selection.selectedResource = null;
        } else if (this.selection.hoveredTile) {
          this.selection.selectedTile = this.selection.hoveredTile;
          this.selection.buildTargetTile = this.selection.hoveredTile;
          this.selection.selectedResource = null;
          this.selection.selectedBuilding = null;
        }
      } else if (this.selection.hoveredResource) {
        this.selection.selectedResource = this.selection.hoveredResource;
        this.selection.selectedTile = this.selection.hoveredTile;
        this.selection.selectedBuilding = null;
      } else if (this.selection.hoveredTile) {
        this.selection.selectedTile = this.selection.hoveredTile;
        if (!this.selection.hoveredResource) {
          this.selection.selectedResource = null;
        }
        this.selection.selectedBuilding = this.selection.hoveredBuilding;
      }
    }

    this.advanceWorldTime(deltaSeconds);
    this.updatePowerSimulation(deltaSeconds);
    this.updateProduction(deltaSeconds);

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
    const selectedProductionInfo = this.getSelectedProductionInfo();
    this.buildToolbar?.render({
      activeBuildingId: this.selection.activeBuildingId,
      buildMode: this.selection.buildMode,
      placementValid: Boolean(this.selection.placement?.valid),
      canHarvest: this.canHarvestSelectedResource(),
      canStartProduction: this.canStartSelectedBuildingProduction(),
      statusMessage: this.getContextualStatusMessage(selectedProductionInfo),
      selectionSummary: this.getToolbarSelectionSummary(selectedProductionInfo),
      recipeSummary: this.getToolbarRecipeSummary(selectedProductionInfo),
      powerSummary: this.getToolbarPowerSummary(),
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
    const selectedResourceDefinition = selectedResource ? this.registry.getResource(selectedResource.resourceId) : null;
    const selectedBuildingDefinition = selectedBuilding ? this.registry.getBuilding(selectedBuilding.buildingId) : null;
    const selectedProductionInfo = this.getSelectedProductionInfo();
    const warnings = [...this.registry.validation.warnings, ...this.assetLoader.warnings];
    const powerState = this.world?.power ?? this.createInitialPowerState();

    this.debugOverlay.render({
      fps: this.fps,
      loadedFiles: this.registry.loadedFiles.length,
      loadedImages: this.assetLoader.loadedImagesCount,
      validation: this.registry.validation.ok ? "ok" : "failed",
      camera: this.camera,
      mouse: this.input.mouse,
      lastPointerType: this.input.lastClickPointerType,
      explicitTouchPlacement: this.input.requiresExplicitTouchPlacement(),
      hoveredTile: hovered,
      selectedTile: selected,
      hoveredResource,
      selectedResource,
      selectedResourceName: this.getLabel(selectedResourceDefinition?.name, selectedResource?.resourceId),
      selectedResourceRemaining: selectedResource?.remaining ?? "—",
      selectedResourceMax: selectedResource?.maxAmount ?? "—",
      selectedResourceDepleted: selectedResource ? (selectedResource.depleted ? "yes" : "no") : "—",
      selectedResourcePossibleDrops: this.formatPossibleDrops(selectedResourceDefinition),
      lastHarvestResult: this.world?.lastHarvestResult?.message ?? "—",
      hoveredBuilding,
      selectedBuilding,
      selectedBuildingName: this.getLabel(selectedBuildingDefinition?.name, selectedBuilding?.buildingId),
      activeBuilding: this.selection.buildMode ? activeBuilding : null,
      placement: this.selection.placement,
      placementHint: this.getPlacementHint(),
      availableRecipes: this.formatAvailableRecipes(selectedProductionInfo?.recipes ?? []),
      selectedRecipeId: selectedProductionInfo?.selectedRecipeId ?? "—",
      activeRecipeId: selectedProductionInfo?.instance?.activeRecipeId ?? "—",
      productionState: selectedProductionInfo?.instance?.productionState ?? "—",
      productionProgress: selectedProductionInfo?.instance?.productionProgress ?? 0,
      productionDuration: selectedProductionInfo?.instance?.productionDuration ?? 0,
      lastProductionResult: selectedProductionInfo?.instance?.lastProductionResult?.message ?? this.world?.lastProductionResult?.message ?? "—",
      dayPhase: this.isDaytime() ? "day" : "night",
      clock: this.formatWorldClock(),
      powerGeneration: powerState.generation,
      powerConsumption: powerState.consumption,
      powerBalance: powerState.balance,
      powerStored: powerState.stored,
      powerCapacity: powerState.storageCapacity,
      powerShortage: powerState.shortage,
      poweredBuildingCount: powerState.poweredBuildingCount,
      unpoweredBuildingCount: powerState.unpoweredBuildingCount,
      selectedBuildingPowered: selectedBuilding ? (selectedBuilding.powered ? "yes" : "no") : "—",
      selectedBuildingPowerRequired: selectedBuilding?.powerRequired ?? 0,
      selectedBuildingPowerProduced: selectedBuilding?.powerProduced ?? 0,
      selectedBuildingPowerReason: selectedBuilding?.powerReason ?? "—",
      generatorFuelStatus: powerState.generatorFuelStatus ?? "—",
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

    const placementTargetTile = this.selection.buildTargetTile ?? this.selection.hoveredTile;
    const origin = placementTargetTile ? { x: placementTargetTile.x, y: placementTargetTile.y } : null;
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

  getRecipesForBuilding(buildingId) {
    return this.registry.getRecipesByBuildingId(buildingId);
  }

  isProductionBuilding(buildingId) {
    return this.getRecipesForBuilding(buildingId).length > 0;
  }

  getSelectedProductionInfo() {
    const instance = this.selection.selectedBuilding;
    if (!instance || !this.isProductionBuilding(instance.buildingId)) {
      return null;
    }

    const recipes = this.getRecipesForBuilding(instance.buildingId);
    const selectedRecipe = this.ensureBuildingRecipeSelection(instance, recipes);
    return {
      instance,
      recipes,
      selectedRecipe,
      selectedRecipeId: selectedRecipe?.id ?? null,
    };
  }

  ensureBuildingRecipeSelection(instance, recipes = this.getRecipesForBuilding(instance.buildingId)) {
    if (recipes.length === 0) {
      instance.selectedRecipeId = null;
      return null;
    }

    const selectedRecipe = recipes.find((recipe) => recipe.id === instance.selectedRecipeId) ?? recipes[0];
    instance.selectedRecipeId = selectedRecipe.id;
    return selectedRecipe;
  }

  canStartSelectedBuildingProduction() {
    if (this.selection.buildMode) {
      return false;
    }

    const info = this.getSelectedProductionInfo();
    if (!info?.selectedRecipe || info.instance?.activeRecipeId) {
      return false;
    }

    if (this.getBuildingPowerDemandRate(info.instance) > 0 && !info.instance.powered) {
      return false;
    }

    return true;
  }

  cycleSelectedBuildingRecipe(direction) {
    if (this.selection.buildMode || direction === 0) {
      return false;
    }

    const info = this.getSelectedProductionInfo();
    if (!info || info.recipes.length <= 1) {
      return false;
    }

    const currentIndex = Math.max(
      0,
      info.recipes.findIndex((recipe) => recipe.id === info.selectedRecipeId),
    );
    const nextIndex = (currentIndex + direction + info.recipes.length) % info.recipes.length;
    const nextRecipe = info.recipes[nextIndex];
    info.instance.selectedRecipeId = nextRecipe.id;
    this.setStatusMessage(`レシピ選択: ${this.getRecipeLabel(nextRecipe)}`);
    this.updateUi();
    return true;
  }

  startSelectedBuildingProduction() {
    if (this.selection.buildMode) {
      this.setStatusMessage("建築モード中は生産を開始できません");
      this.updateUi();
      return false;
    }

    const info = this.getSelectedProductionInfo();
    if (!info) {
      this.setStatusMessage("生産施設を選択してください");
      this.updateUi();
      return false;
    }

    const recipeToStart =
      info.recipes.find((recipe) => this.validateInventory(recipe.inputs).ok) ?? info.selectedRecipe;

    return this.startProduction(info.instance, recipeToStart?.id);
  }

  startProduction(instance, recipeId) {
    if (!instance || !recipeId) {
      return false;
    }

    if (instance.activeRecipeId) {
      const powerBlocked = instance.productionState === "paused_unpowered";
      this.setStatusMessage(
        powerBlocked
          ? this.getPowerBlockedMessage(instance)
          : `${this.getBuildingInstanceLabel(instance)} は稼働中です`,
      );
      this.updateUi();
      return false;
    }

    const recipe = this.registry.getRecipe(recipeId);
    if (!recipe || recipe.buildingId !== instance.buildingId) {
      this.setStatusMessage("この施設ではそのレシピを実行できません");
      this.updateUi();
      return false;
    }

    const affordability = this.validateInventory(recipe.inputs);
    if (!affordability.ok) {
      this.setStatusMessage(`資材不足: ${affordability.missing.map((itemId) => this.getItemLabel(itemId)).join(", ")}`);
      this.updateUi();
      return false;
    }

    if (this.getBuildingPowerDemandRate(instance) > 0 && !instance.powered) {
      this.setStatusMessage(this.getPowerBlockedMessage(instance));
      this.updateUi();
      return false;
    }

    this.consumeInventory(recipe.inputs);
    instance.selectedRecipeId = recipe.id;
    instance.activeRecipeId = recipe.id;
    instance.productionProgress = 0;
    instance.productionDuration = Number(recipe.durationSeconds) || 0;
    instance.productionState = "running";
    instance.queuedRecipeId = null;
    instance.lastProductionResult = null;
    this.setStatusMessage(`${this.getBuildingInstanceLabel(instance)}: ${this.getRecipeLabel(recipe)} を開始しました`);
    this.updateUi();
    return true;
  }

  updateProduction(deltaSeconds) {
    for (const instance of this.world?.buildings ?? []) {
      if (!instance.activeRecipeId) {
        continue;
      }

      const powerDemand = this.getBuildingPowerDemandRate(instance);
      if (powerDemand > 0 && !instance.powered) {
        instance.productionState = "paused_unpowered";
        continue;
      }

      if (instance.productionState === "paused_unpowered") {
        instance.productionState = "running";
      }

      if (instance.productionState !== "running") {
        continue;
      }

      instance.productionProgress = Math.min(
        instance.productionDuration,
        (instance.productionProgress ?? 0) + deltaSeconds,
      );

      if (instance.productionProgress < instance.productionDuration) {
        continue;
      }

      this.completeProduction(instance);
    }
  }

  completeProduction(instance) {
    const recipe = this.registry.getRecipe(instance.activeRecipeId);
    if (!recipe) {
      instance.productionState = "idle";
      instance.activeRecipeId = null;
      instance.productionProgress = 0;
      instance.productionDuration = 0;
      return;
    }

    this.addToInventory(recipe.outputs);
    const message = `${this.getBuildingInstanceLabel(instance)}: ${this.formatItemDeltaSummary(recipe.outputs)} を生産しました`;
    const result = {
      recipeId: recipe.id,
      outputs: { ...recipe.outputs },
      message,
    };

    instance.productionState = "idle";
    instance.activeRecipeId = null;
    instance.productionProgress = 0;
    instance.productionDuration = 0;
    instance.lastProductionResult = result;
    this.world.lastProductionResult = result;
    this.setStatusMessage(message);
  }

  getRecipeLabel(recipe) {
    return this.getLabel(recipe?.name, recipe?.id ?? "recipe");
  }

  getBuildingInstanceLabel(instance) {
    const definition = this.registry.getBuilding(instance?.buildingId);
    return this.getLabel(definition?.name, instance?.buildingId ?? "building");
  }

  formatAvailableRecipes(recipes) {
    if (!recipes?.length) {
      return "—";
    }

    return recipes
      .map((recipe) => {
        const availability = this.validateInventory(recipe.inputs);
        return `${recipe.id}${availability.ok ? " [ready]" : " [missing]"}`;
      })
      .join(", ");
  }

  getToolbarSelectionSummary(selectedProductionInfo) {
    if (this.selection.buildMode) {
      const building = this.registry.getBuilding(this.selection.activeBuildingId);
      return `建築: ${this.getLabel(building?.name, this.selection.activeBuildingId)}`;
    }

    if (selectedProductionInfo) {
      return `選択: ${this.getBuildingInstanceLabel(selectedProductionInfo.instance)}`;
    }

    if (this.selection.selectedResource) {
      return `選択: ${this.getResourceLabel(this.selection.selectedResource)}`;
    }

    if (this.selection.selectedBuilding) {
      return `選択: ${this.getBuildingInstanceLabel(this.selection.selectedBuilding)}`;
    }

    return "";
  }

  getToolbarRecipeSummary(selectedProductionInfo) {
    if (this.selection.buildMode) {
      return this.getPlacementHint();
    }

    if (!selectedProductionInfo) {
      return "";
    }

    const instance = selectedProductionInfo.instance;
    if (instance.productionState === "running") {
      let ratio = 0;
      if (instance.productionDuration > 0) {
        ratio = Math.round((instance.productionProgress / instance.productionDuration) * 100);
      }
      return `稼働中: ${this.getRecipeLabel(this.registry.getRecipe(instance.activeRecipeId))} ${ratio}%`;
    }

    if (instance.productionState === "paused_unpowered" && instance.activeRecipeId) {
      let ratio = 0;
      if (instance.productionDuration > 0) {
        ratio = Math.round((instance.productionProgress / instance.productionDuration) * 100);
      }
      return `停電停止: ${this.getRecipeLabel(this.registry.getRecipe(instance.activeRecipeId))} ${ratio}%`;
    }

    if (selectedProductionInfo.selectedRecipe) {
      return `待機: ${this.getRecipeLabel(selectedProductionInfo.selectedRecipe)} / P または 生産で開始`;
    }

    return "この施設にレシピはありません";
  }

  getToolbarPowerSummary() {
    const power = this.world?.power;
    if (!power) {
      return "";
    }

    const balancePrefix = power.balance >= 0 ? "+" : "";
    return `電力 ${balancePrefix}${power.balance.toFixed(1)} / 消費 ${power.consumption.toFixed(1)} / 蓄電 ${power.stored.toFixed(1)}/${power.storageCapacity.toFixed(1)}`;
  }

  getPlacementHint() {
    if (!this.selection.buildMode) {
      return "";
    }

    if (this.input.requiresExplicitTouchPlacement()) {
      return "配置予定地を選択中 / 配置ボタンで確定";
    }

    return "クリックまたは Enter で配置";
  }

  getContextualStatusMessage(selectedProductionInfo) {
    const contextual = this.selection.buildMode
      ? this.getPlacementHint()
      : this.getToolbarRecipeSummary(selectedProductionInfo);
    return [...new Set([contextual, this.statusMessage].filter(Boolean))].join("\n");
  }

  getPowerBlockedMessage(instance) {
    return `${this.getBuildingInstanceLabel(instance)} は停電中です (${instance.powerReason ?? "power shortage"})`;
  }

  createInitialTimeState() {
    const timeConfig = this.getTimeConfig();
    return {
      minutesPerDay: timeConfig.minutesPerDay,
      dayStartHour: timeConfig.dayStartHour,
      nightStartHour: timeConfig.nightStartHour,
      timeScale: timeConfig.defaultTimeScale,
      elapsedMinutes: timeConfig.dayStartHour * 60,
    };
  }

  createInitialPowerState() {
    return {
      generation: 0,
      consumption: 0,
      balance: 0,
      storageCapacity: 0,
      stored: 0,
      shortage: 0,
      poweredBuildingCount: 0,
      unpoweredBuildingCount: 0,
      generatorFuelStatus: "—",
      initialized: false,
    };
  }

  getTimeConfig() {
    const time = this.registry.getMeta("constants")?.time ?? {};
    return {
      minutesPerDay: Number(time.minutesPerDay) || 1440,
      defaultTimeScale: Number(time.defaultTimeScale) || 1,
      dayStartHour: Number(time.dayStartHour) || 6,
      nightStartHour: Number(time.nightStartHour) || 18,
    };
  }

  advanceWorldTime(deltaSeconds) {
    if (!this.world?.time) {
      this.world.time = this.createInitialTimeState();
    }

    const minutesPerDay = this.world.time.minutesPerDay || 1440;
    const deltaMinutes = deltaSeconds * (this.world.time.timeScale || 1);
    this.world.time.elapsedMinutes = ((this.world.time.elapsedMinutes ?? 0) + deltaMinutes) % minutesPerDay;
    this.world.time.deltaMinutes = deltaMinutes;
  }

  getCurrentHour() {
    if (!this.world?.time) {
      return 0;
    }

    return ((this.world.time.elapsedMinutes ?? 0) / 60) % 24;
  }

  isDaytime() {
    const worldTime = this.world?.time;
    if (!worldTime) {
      return true;
    }

    const hour = this.getCurrentHour();
    return hour >= worldTime.dayStartHour && hour < worldTime.nightStartHour;
  }

  formatWorldClock() {
    if (!this.world?.time) {
      return "—";
    }

    const totalMinutes = Math.floor(this.world.time.elapsedMinutes ?? 0);
    const hour = Math.floor((totalMinutes / 60) % 24);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  getPowerConfig() {
    const powerConfig = this.registry.getMeta("constants")?.power ?? {};
    return {
      recalculationIntervalSeconds:
        Number(powerConfig.recalculationIntervalSeconds) || DEFAULT_POWER_RECALCULATION_SECONDS,
      defaultOutagePriority: Array.isArray(powerConfig.defaultOutagePriority)
        ? powerConfig.defaultOutagePriority
        : ["core", "survival", "power", "production", "extraction", "research", "defense", "sensors", "maintenance"],
    };
  }

  getPowerSimulationStepMinutes() {
    const timeScale = this.world?.time?.timeScale || this.getTimeConfig().defaultTimeScale;
    return timeScale * this.getPowerConfig().recalculationIntervalSeconds;
  }

  getBuildingPowerConfig(buildingOrId) {
    const building = typeof buildingOrId === "string" ? this.registry.getBuilding(buildingOrId) : buildingOrId;
    return building?.power ?? {};
  }

  getBuildingPowerPriority(instance) {
    const building = this.registry.getBuilding(instance?.buildingId);
    const category = building?.category ?? "misc";
    const priorities = this.getPowerConfig().defaultOutagePriority;
    const index = priorities.indexOf(category);
    return index === -1 ? priorities.length + 1 : index;
  }

  getBuildingPowerDemandRate(instance) {
    return Number(instance?.powerRequired ?? this.getBuildingPowerConfig(instance?.buildingId).consumes) || 0;
  }

  getBuildingPowerGenerationRate(instance) {
    const powerConfig = this.getBuildingPowerConfig(instance?.buildingId);
    if (!powerConfig) {
      return 0;
    }

    if (typeof powerConfig.producesDay === "number" || typeof powerConfig.producesNight === "number") {
      return this.isDaytime() ? Number(powerConfig.producesDay) || 0 : Number(powerConfig.producesNight) || 0;
    }

    return Number(powerConfig.produces) || 0;
  }

  updatePowerSimulation(deltaSeconds) {
    if (!this.world) {
      return;
    }

    this.powerAccumulator += deltaSeconds;
    if (this.powerAccumulator < this.getPowerConfig().recalculationIntervalSeconds) {
      return;
    }

    const elapsedSeconds = this.powerAccumulator;
    this.powerAccumulator = 0;
    this.recalculatePowerState(elapsedSeconds);
  }

  recalculatePowerState(deltaSeconds) {
    if (!this.world) {
      return;
    }

    const deltaMinutes = Math.max(
      0,
      this.world.time?.deltaMinutes ??
        (deltaSeconds * (this.world.time?.timeScale || this.getTimeConfig().defaultTimeScale)),
    );
    const effectiveDeltaMinutes = Math.max(deltaMinutes, this.getPowerSimulationStepMinutes());
    const isDay = this.isDaytime();
    let storageCapacity = 0;
    let generation = 0;
    let requestedConsumption = 0;

    for (const instance of this.world.buildings ?? []) {
      const powerConfig = this.getBuildingPowerConfig(instance.buildingId);
      instance.powerPriority = this.getBuildingPowerPriority(instance);
      instance.powerRequired = Number(powerConfig.consumes) || 0;
      instance.powerProduced = 0;
      instance.powerStorage = Number(powerConfig.storage) || 0;
      instance.powerReason = instance.powerRequired > 0 ? "awaiting power allocation" : "no power required";
      storageCapacity += instance.powerStorage;
    }

    if (!this.world.power) {
      this.world.power = this.createInitialPowerState();
    }

    if (!this.world.power.initialized) {
      this.world.power.stored = storageCapacity;
      this.world.power.initialized = true;
    }

    if (!Number.isFinite(this.world.power.stored)) {
      this.world.power.stored = storageCapacity;
    }
    this.world.power.storageCapacity = storageCapacity;
    this.world.power.stored = Math.min(storageCapacity, Math.max(0, this.world.power.stored ?? storageCapacity));

    const generatorStatuses = [];
    for (const instance of this.world.buildings ?? []) {
      const powerConfig = this.getBuildingPowerConfig(instance.buildingId);
      let produced = this.getBuildingPowerGenerationRate(instance);
      const usesFuel = Boolean(powerConfig.fuelItem);

      if (usesFuel) {
        const fuelStatus = this.refreshGeneratorFuel(instance, deltaMinutes);
        produced = fuelStatus.active ? produced : 0;
        instance.powerReason = fuelStatus.reason;
        generatorStatuses.push(
          `${this.getBuildingInstanceLabel(instance)} ${fuelStatus.active ? `${fuelStatus.remainingMinutes.toFixed(1)}m` : "fuel empty"}`,
        );
      } else if (typeof powerConfig.producesDay === "number" || typeof powerConfig.producesNight === "number") {
        instance.powerReason = produced > 0 ? "solar generating" : isDay ? "low daylight output" : "night output 0";
      } else if (produced > 0) {
        instance.powerReason = "generating power";
      }

      instance.powerProduced = produced;
      generation += produced;
      if (produced > 0 || instance.buildingId === "building_crash_core") {
        instance.powered = true;
        if (instance.buildingId === "building_crash_core") {
          instance.powerReason = "core online";
        }
      }
      requestedConsumption += instance.powerRequired;
    }

    const availableEnergy = generation * effectiveDeltaMinutes + (this.world.power.stored ?? 0);
    let remainingEnergy = availableEnergy;
    let actualConsumption = 0;
    let poweredBuildingCount = 0;
    let unpoweredBuildingCount = 0;

    const consumers = [...(this.world.buildings ?? [])]
      .filter((instance) => instance.powerRequired > 0 && instance.buildingId !== "building_crash_core")
      .sort((left, right) => {
        if (left.powerPriority !== right.powerPriority) {
          return left.powerPriority - right.powerPriority;
        }
        return left.instanceId.localeCompare(right.instanceId);
      });

    for (const instance of this.world.buildings ?? []) {
      if (instance.buildingId === "building_crash_core" || instance.powerRequired <= 0) {
        instance.powered = true;
        poweredBuildingCount += 1;
      }
    }

    for (const instance of consumers) {
      const requiredEnergy = instance.powerRequired * effectiveDeltaMinutes;
      // Allow a tiny positive tolerance on the remaining pool so per-tick rounding
      // does not incorrectly flicker a building between powered and unpowered.
      if (requiredEnergy <= remainingEnergy + ENERGY_COMPARISON_EPSILON) {
        instance.powered = true;
        instance.powerReason = instance.powerReason === "awaiting power allocation" ? "powered" : instance.powerReason;
        remainingEnergy -= requiredEnergy;
        actualConsumption += instance.powerRequired;
        poweredBuildingCount += 1;
        continue;
      }

      instance.powered = false;
      instance.powerReason = "insufficient power";
      unpoweredBuildingCount += 1;
    }

    for (const instance of this.world.buildings ?? []) {
      if (instance.powerRequired > 0 && !consumers.includes(instance) && instance.buildingId !== "building_crash_core") {
        if (instance.powered) {
          poweredBuildingCount += 1;
        } else {
          unpoweredBuildingCount += 1;
        }
      }
    }

    this.world.power = {
      generation,
      consumption: requestedConsumption,
      balance: generation - requestedConsumption,
      storageCapacity,
      stored: Math.min(storageCapacity, Math.max(0, remainingEnergy)),
      shortage: Math.max(0, requestedConsumption - actualConsumption),
      poweredBuildingCount,
      unpoweredBuildingCount,
      generatorFuelStatus: generatorStatuses.join(" / ") || "no fueled generators",
      initialized: true,
    };
  }

  refreshGeneratorFuel(instance, deltaMinutes) {
    const powerConfig = this.getBuildingPowerConfig(instance.buildingId);
    const fuelItem = powerConfig.fuelItem;
    if (!fuelItem) {
      return { active: true, remainingMinutes: 0, reason: "generating power" };
    }

    instance.generatorFuelRemainingMinutes = Math.max(0, Number(instance.generatorFuelRemainingMinutes) || 0);
    if (instance.generatorFuelRemainingMinutes <= 0) {
      if ((this.world.inventory?.[fuelItem] ?? 0) > 0) {
        this.world.inventory[fuelItem] -= 1;
        instance.generatorFuelRemainingMinutes = Number(powerConfig.fuelMinutesPerItem) || 0;
      }
    }

    const active = instance.generatorFuelRemainingMinutes > 0;
    if (active) {
      instance.generatorFuelRemainingMinutes = Math.max(0, instance.generatorFuelRemainingMinutes - deltaMinutes);
    }

    return {
      active,
      remainingMinutes: Math.max(0, instance.generatorFuelRemainingMinutes),
      reason: active ? `fuel ${instance.generatorFuelRemainingMinutes.toFixed(1)}m remaining` : "fuel unavailable",
    };
  }

  getLabel(localizedValue, fallback = "—") {
    if (!localizedValue) {
      return fallback;
    }

    if (typeof localizedValue === "string") {
      return localizedValue;
    }

    return LABEL_PRIORITY.map((locale) => localizedValue?.[locale]).find(Boolean) ?? fallback;
  }

  formatPossibleDrops(resource) {
    if (!resource) {
      return "—";
    }

    return Object.entries(resource.primaryDrops ?? {})
      .map(([itemId, range]) => `${this.getItemLabel(itemId)} ${this.formatRange(range)}`)
      .join(", ") || "—";
  }

  formatRange(range = []) {
    const [min = 0, max = min] = range;
    return min === max ? String(min) : `${min}-${max}`;
  }

  getItemLabel(itemId) {
    const item = this.registry.getItem(itemId);
    return this.getLabel(item?.name, itemId);
  }

  getResourceLabel(resourceNode) {
    return this.getLabel(resourceNode?.name, resourceNode?.resourceId ?? "resource");
  }

  setStatusMessage(message) {
    this.statusMessage = message ?? "";
  }

  canHarvestSelectedResource() {
    return (
      Boolean(this.selection.selectedResource) &&
      !this.selection.buildMode &&
      !this.selection.selectedResource.depleted &&
      (this.selection.selectedResource.remaining ?? 0) > 0
    );
  }

  harvestSelectedResource() {
    const resourceNode = this.selection.selectedResource;
    if (!resourceNode) {
      this.setStatusMessage("採取対象の資源を選択してください");
      this.updateUi();
      return false;
    }

    if (this.selection.buildMode) {
      this.setStatusMessage("建築モード中は採取できません");
      this.updateUi();
      return false;
    }

    if (resourceNode.depleted || resourceNode.remaining <= 0) {
      resourceNode.remaining = 0;
      resourceNode.depleted = true;
      this.setStatusMessage(`${this.getResourceLabel(resourceNode)} は枯渇しています`);
      this.updateUi();
      return false;
    }

    const harvestResult = this.resolveHarvest(resourceNode);
    this.addToInventory(harvestResult.drops);
    resourceNode.remaining = Math.max(0, resourceNode.remaining - harvestResult.consumedAmount);
    resourceNode.harvestCount = (resourceNode.harvestCount ?? 0) + 1;
    resourceNode.depleted = resourceNode.remaining <= 0;

    const message = `${this.getResourceLabel(resourceNode)} 採取: ${this.formatItemDeltaSummary(harvestResult.drops)}${
      resourceNode.depleted ? " / 枯渇" : ""
    }`;
    this.world.lastHarvestResult = {
      resourceId: resourceNode.resourceId,
      resourceInstanceId: resourceNode.instanceId,
      drops: harvestResult.drops,
      consumedAmount: harvestResult.consumedAmount,
      remaining: resourceNode.remaining,
      maxAmount: resourceNode.maxAmount,
      depleted: resourceNode.depleted,
      message,
    };
    this.setStatusMessage(message);
    this.updateUi();
    return true;
  }

  resolveHarvest(resourceNode) {
    const resource = this.registry.getResource(resourceNode.resourceId);
    const entries = Object.entries(resource?.primaryDrops ?? {});
    const harvestStep = this.getHarvestStep(resourceNode);
    const consumedAmount = Math.min(resourceNode.remaining, harvestStep);
    const efficiency = harvestStep > 0 ? consumedAmount / harvestStep : 0;
    const drops = {};

    entries.forEach(([itemId, range], index) => {
      const rolledAmount = this.rollDeterministicRange(range, resourceNode.harvestSeed, resourceNode.harvestCount ?? 0, index + 1);
      if (rolledAmount <= 0 || efficiency <= 0) {
        return;
      }

      const scaledAmount = Math.max(1, Math.round(rolledAmount * efficiency));
      drops[itemId] = scaledAmount;
    });

    return { consumedAmount, drops };
  }

  getHarvestStep(resourceNode) {
    const targetActions = Math.min(40, Math.max(3, Math.round(Math.sqrt(resourceNode.maxAmount ?? 1))));
    return Math.max(1, Math.ceil((resourceNode.maxAmount ?? 1) / targetActions));
  }

  rollDeterministicRange(range, seed, harvestCount, salt) {
    const [min = 0, max = min] = range ?? [0, 0];
    if (min === max) {
      return min;
    }

    const noise = this.sample(seed * 17 + (harvestCount + 1) * 101 + salt * 271, harvestCount + salt, salt * 7);
    return Math.min(max, min + Math.floor(noise * (max - min + 1)));
  }

  sample(seed, x, y) {
    const value = Math.sin((x + seed * 0.001) * 12.9898 + (y - seed * 0.001) * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  formatItemDeltaSummary(items = {}) {
    const parts = Object.entries(items)
      .filter(([, amount]) => amount > 0)
      .map(([itemId, amount]) => `${this.getItemLabel(itemId)} +${amount}`);
    return parts.join(", ") || "なし";
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
    this.selection.buildTargetTile = placement.origin;
    this.selection.placement = this.getPlacementPreview();
    this.setStatusMessage(`${this.getBuildingInstanceLabel(instance)} を配置しました`);
    return true;
  }

  activateBuildMode(buildingId) {
    if (!this.registry.getBuilding(buildingId)) {
      return;
    }

    this.selection.activeBuildingId = buildingId;
    this.selection.buildMode = true;
    this.selection.selectedResource = null;
    this.selection.selectedBuilding = null;
    this.selection.buildTargetTile = this.input.requiresExplicitPlacementForCurrentInteraction()
      ? this.selection.selectedTile
      : this.selection.hoveredTile;
    this.selection.placement = this.getPlacementPreview();
    this.updateUi();
  }

  cancelBuildMode() {
    this.selection.buildMode = false;
    this.selection.buildTargetTile = null;
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
    const powerConfig = this.getBuildingPowerConfig(building);
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
      powerPriority: this.getBuildingPowerPriority({ buildingId: building.id }),
      powerRequired: Number(powerConfig.consumes) || 0,
      powerProduced: 0,
      powerStorage: Number(powerConfig.storage) || 0,
      powerReason: building.id === "building_crash_core" ? "core online" : "no power required",
      generatorFuelRemainingMinutes: 0,
      selectedRecipeId: this.getRecipesForBuilding(building.id)[0]?.id ?? null,
      activeRecipeId: null,
      productionProgress: 0,
      productionDuration: 0,
      productionState: "idle",
      queuedRecipeId: null,
      lastProductionResult: null,
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

    this.recalculatePowerState(0);
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

  addToInventory(items = {}) {
    for (const [itemId, amount] of Object.entries(items)) {
      if (amount <= 0) {
        continue;
      }

      this.world.inventory[itemId] = (this.world.inventory[itemId] ?? 0) + amount;
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
