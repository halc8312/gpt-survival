const formatTile = (tile) => (tile ? `${tile.x}, ${tile.y}` : "—");
const LABEL_PRIORITY = ["ja", "en"];

const formatResource = (resourceNode) => {
  if (!resourceNode) {
    return "—";
  }

  const label = LABEL_PRIORITY.map((locale) => resourceNode.name?.[locale]).find(Boolean) ?? resourceNode.resourceId;
  return `${label} (${resourceNode.resourceId})`;
};

const formatBuilding = (building) => building?.buildingId ?? "—";

const formatPlacementReason = (reason) => {
  if (!reason) {
    return "—";
  }

  if (reason === "no_hover_tile") {
    return "hover a tile";
  }

  if (reason === "out_of_bounds") {
    return "map bounds";
  }

  if (reason === "tile_not_buildable") {
    return "tile not buildable";
  }

  if (reason.startsWith("resource_overlap:")) {
    return `resource overlap (${reason.split(":")[1]})`;
  }

  if (reason.startsWith("building_overlap:")) {
    return `building overlap (${reason.split(":")[1]})`;
  }

  if (reason.startsWith("insufficient_resources:")) {
    const missing = reason.split(":")[1];
    return missing ? `insufficient resources (${missing})` : "insufficient resources";
  }

  return reason;
};

const formatProductionProgress = (progressSeconds, durationSeconds) => {
  if (!durationSeconds) {
    return "—";
  }

  return `${progressSeconds.toFixed(1)} / ${durationSeconds.toFixed(1)} sec`;
};

export class DebugOverlay {
  constructor(element) {
    this.element = element;
    this.contentElement = element.querySelector("[data-debug-content]") ?? element;
    this.toggleButton = element.querySelector("[data-debug-toggle]") ?? null;
    this.compactQuery = window.matchMedia("(max-width: 960px), (max-height: 720px), (pointer: coarse)");
    this.userCollapsed = null;

    if (this.toggleButton) {
      this.toggleButton.addEventListener("click", () => {
        this.userCollapsed = !this.isCollapsed();
        this.updateCollapsedState();
      });
    }

    const mediaHandler = () => {
      if (!this.compactQuery.matches) {
        this.userCollapsed = null;
      }
      this.updateCollapsedState();
    };

    if (typeof this.compactQuery.addEventListener === "function") {
      this.compactQuery.addEventListener("change", mediaHandler);
    } else if (typeof this.compactQuery.addListener === "function") {
      this.compactQuery.addListener(mediaHandler);
    }

    this.updateCollapsedState();
  }

  isCollapsed() {
    return this.compactQuery.matches ? (this.userCollapsed ?? true) : false;
  }

  updateCollapsedState() {
    const collapsed = this.isCollapsed();
    this.element.classList.toggle("debug-overlay--compact", this.compactQuery.matches);
    this.element.classList.toggle("is-collapsed", collapsed);

    if (this.toggleButton) {
      this.toggleButton.textContent = collapsed ? "Debug" : "Hide debug";
      this.toggleButton.setAttribute("aria-expanded", String(!collapsed));
    }
  }

  render(state) {
    const hoveredTileId = state.hoveredTile?.tileId ?? "—";
    const selectedTileId = state.selectedTile?.tileId ?? "—";
    const selectedBiomeId = state.selectedTile?.biomeId ?? state.hoveredTile?.biomeId ?? "—";
    const selectedBuildable = state.selectedTile?.buildable ?? state.hoveredTile?.buildable ?? false;
    const placementValid = state.placement ? (state.placement.valid ? "valid" : "invalid") : "—";

    this.contentElement.textContent = [
      `FPS: ${state.fps}`,
      `Loaded data files: ${state.loadedFiles}`,
      `Loaded images: ${state.loadedImages}`,
      `Validation: ${state.validation}`,
      `Camera: ${state.camera.x.toFixed(1)}, ${state.camera.y.toFixed(1)} @ ${state.camera.zoom.toFixed(2)}x`,
      `Mouse: ${Math.round(state.mouse.x)}, ${Math.round(state.mouse.y)}`,
      `Last pointer type: ${state.lastPointerType ?? "—"}`,
      `Touch placement confirm: ${state.explicitTouchPlacement ? "required" : "off"}`,
      `Hovered tile: ${formatTile(state.hoveredTile)}`,
      `Selected tile: ${formatTile(state.selectedTile)}`,
      `Selected tile ID: ${selectedTileId}`,
      `Hover tile ID: ${hoveredTileId}`,
      `Buildable: ${selectedBuildable ? "yes" : "no"}`,
      `Biome: ${selectedBiomeId}`,
      `Hovered resource ID: ${state.hoveredResource?.resourceId ?? "—"}`,
      `Hovered resource: ${formatResource(state.hoveredResource)}`,
      `Selected resource ID: ${state.selectedResource?.resourceId ?? "—"}`,
      `Selected resource: ${formatResource(state.selectedResource)}`,
      `Selected resource name: ${state.selectedResourceName ?? "—"}`,
      `Selected resource remaining: ${state.selectedResourceRemaining ?? "—"} / ${state.selectedResourceMax ?? "—"}`,
      `Selected resource depleted: ${state.selectedResourceDepleted ?? "—"}`,
      `Selected resource possible drops: ${state.selectedResourcePossibleDrops ?? "—"}`,
      `Last harvest result: ${state.lastHarvestResult ?? "—"}`,
      `Hovered building ID: ${formatBuilding(state.hoveredBuilding)}`,
      `Selected building ID: ${formatBuilding(state.selectedBuilding)}`,
      `Selected building name: ${state.selectedBuildingName ?? "—"}`,
      `Active building ghost ID: ${state.activeBuilding?.id ?? "—"}`,
      `Placement: ${placementValid}`,
      `Invalid reason: ${state.placement?.valid ? "—" : formatPlacementReason(state.placement?.reason)}`,
      `Placement hint: ${state.placementHint ?? "—"}`,
      `Available recipes: ${state.availableRecipes ?? "—"}`,
      `Selected recipe ID: ${state.selectedRecipeId ?? "—"}`,
      `Active recipe ID: ${state.activeRecipeId ?? "—"}`,
      `Production state: ${state.productionState ?? "—"}`,
      `Production progress: ${formatProductionProgress(state.productionProgress ?? 0, state.productionDuration ?? 0)}`,
      `Last production result: ${state.lastProductionResult ?? "—"}`,
      `Buildings count: ${state.buildingsCount}`,
      `Inventory summary: ${state.inventorySummary}`,
      `Warnings: ${state.warningCount}`,
    ].join("\n");
  }
}
