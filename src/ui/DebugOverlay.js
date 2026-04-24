const formatTile = (tile) => (tile ? `${tile.x}, ${tile.y}` : "—");

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
      `Warnings: ${state.warningCount}`,
    ].join("\n");
  }
}
