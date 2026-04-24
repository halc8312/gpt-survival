export class MapRenderer {
  constructor({ ctx, camera, registry, assetLoader, tileWidth, tileHeight }) {
    this.ctx = ctx;
    this.camera = camera;
    this.registry = registry;
    this.assetLoader = assetLoader;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
  }

  render(world, selectionState) {
    for (let diagonal = 0; diagonal <= world.width + world.height - 2; diagonal += 1) {
      for (let x = 0; x <= diagonal; x += 1) {
        const y = diagonal - x;
        if (x >= world.width || y >= world.height) {
          continue;
        }

        const tile = world.tiles[y][x];
        this.drawTile(tile);
      }
    }

    if (selectionState.hoveredTile) {
      this.drawOutline(selectionState.hoveredTile, "rgba(127, 246, 255, 0.95)", "rgba(127, 246, 255, 0.16)");
    }

    if (selectionState.selectedTile) {
      this.drawOutline(selectionState.selectedTile, "rgba(255, 213, 74, 0.95)", "rgba(255, 213, 74, 0.18)");
    }
  }

  drawTile(tile) {
    const projected = this.tileToWorld(tile.x, tile.y);
    const screen = this.camera.worldToScreen(projected.x, projected.y);
    const spritePath = tile.tile.sprites?.[0];
    const sprite = this.assetLoader.getImage(spritePath);
    const width = this.tileWidth * this.camera.zoom;
    const height = this.tileHeight * this.camera.zoom;

    this.ctx.drawImage(
      sprite,
      Math.round(screen.x - width / 2),
      Math.round(screen.y),
      width,
      height,
    );
  }

  drawOutline(tile, strokeStyle, fillStyle) {
    const projected = this.tileToWorld(tile.x, tile.y);
    const screen = this.camera.worldToScreen(projected.x, projected.y);
    const width = this.tileWidth * this.camera.zoom;
    const height = this.tileHeight * this.camera.zoom;

    this.ctx.beginPath();
    this.ctx.moveTo(screen.x, screen.y);
    this.ctx.lineTo(screen.x + width / 2, screen.y + height / 2);
    this.ctx.lineTo(screen.x, screen.y + height);
    this.ctx.lineTo(screen.x - width / 2, screen.y + height / 2);
    this.ctx.closePath();
    this.ctx.fillStyle = fillStyle;
    this.ctx.fill();
    this.ctx.lineWidth = Math.max(1.5, this.camera.zoom * 1.5);
    this.ctx.strokeStyle = strokeStyle;
    this.ctx.stroke();
  }

  // The forward isometric transform turns tile coordinates into the top vertex
  // of a diamond so the rectangular grid can be drawn as an isometric map.
  tileToWorld(tileX, tileY) {
    return {
      x: (tileX - tileY) * (this.tileWidth / 2),
      y: (tileX + tileY) * (this.tileHeight / 2),
    };
  }

  // Tile picking inverts the isometric transform, then tests nearby candidates
  // against the diamond bounds for accurate hover/selection near tile edges.
  screenToTile(screenX, screenY, world) {
    const worldPoint = this.camera.screenToWorld(screenX, screenY);
    const fractionalX = worldPoint.y / this.tileHeight + worldPoint.x / this.tileWidth;
    const fractionalY = worldPoint.y / this.tileHeight - worldPoint.x / this.tileWidth;
    const candidates = [];

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        candidates.push({
          x: Math.floor(fractionalX) + offsetX,
          y: Math.floor(fractionalY) + offsetY,
        });
      }
    }

    for (const candidate of candidates) {
      if (
        candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.x >= world.width ||
        candidate.y >= world.height
      ) {
        continue;
      }

      const projected = this.tileToWorld(candidate.x, candidate.y);
      const localX = worldPoint.x - projected.x;
      const localY = worldPoint.y - projected.y;
      const distance =
        Math.abs(localX) / (this.tileWidth / 2) +
        Math.abs(localY - this.tileHeight / 2) / (this.tileHeight / 2);

      if (distance <= 1) {
        return world.tiles[candidate.y][candidate.x];
      }
    }

    return null;
  }
}
