const formatTile = (tile) => (tile ? `${tile.x}, ${tile.y}` : "—");
const LABEL_PRIORITY = ["ja", "en"];

const formatResource = (resourceNode) => {
  if (!resourceNode) {
    return "—";
  }

  const label = LABEL_PRIORITY.map((locale) => resourceNode.name?.[locale]).find(Boolean) ?? resourceNode.resourceId;
  return `${label} (${resourceNode.resourceId})`;
};

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

  return reason;
};

export class DebugOverlay {
  constructor(element) {
    this.element = element;
  }

  render(state) {
    const hoveredTileId = state.hoveredTile?.tileId ?? "—";
    const selectedTileId = state.selectedTile?.tileId ?? "—";
    const selectedBiomeId = state.selectedTile?.biomeId ?? state.hoveredTile?.biomeId ?? "—";
    const selectedBuildable =
      state.selectedTile?.buildable ?? state.hoveredTile?.buildable ?? false;
    const placementValid = state.placement ? (state.placement.valid ? "valid" : "invalid") : "—";

    this.element.textContent = [
      `FPS: ${state.fps}`,
      `Loaded data files: ${state.loadedFiles}`,
      `Loaded images: ${state.loadedImages}`,
      `Validation: ${state.validation}`,
      `Camera: ${state.camera.x.toFixed(1)}, ${state.camera.y.toFixed(1)} @ ${state.camera.zoom.toFixed(2)}x`,
      `Mouse: ${Math.round(state.mouse.x)}, ${Math.round(state.mouse.y)}`,
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
      `Active building ghost ID: ${state.activeBuilding?.id ?? "—"}`,
      `Placement: ${placementValid}`,
      `Invalid reason: ${state.placement?.valid ? "—" : formatPlacementReason(state.placement?.reason)}`,
      `Warnings: ${state.warningCount}`,
    ].join("\n");
  }
}
