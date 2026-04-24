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

    for (const entity of this.collectRenderableEntities(world)) {
      if (entity.type === "resource") {
        this.drawResourceNode(entity.record);
        if (entity.record.footprint.width > 1 || entity.record.footprint.height > 1) {
          this.drawFootprint(entity.record.occupiedTiles, "rgba(190, 214, 233, 0.18)", "rgba(190, 214, 233, 0.06)");
        }
        continue;
      }

      this.drawBuilding(entity.record);
    }

    if (selectionState.hoveredResource) {
      this.drawFootprint(
        selectionState.hoveredResource.occupiedTiles,
        "rgba(127, 246, 255, 0.95)",
        "rgba(127, 246, 255, 0.12)",
      );
    }

    if (selectionState.selectedResource) {
      this.drawFootprint(
        selectionState.selectedResource.occupiedTiles,
        "rgba(255, 213, 74, 0.95)",
        "rgba(255, 213, 74, 0.14)",
      );
    }

    if (selectionState.hoveredBuilding) {
      this.drawFootprint(
        selectionState.hoveredBuilding.occupiedTiles,
        "rgba(127, 246, 255, 0.95)",
        "rgba(127, 246, 255, 0.08)",
      );
    }

    if (selectionState.selectedBuilding) {
      this.drawFootprint(
        selectionState.selectedBuilding.occupiedTiles,
        "rgba(255, 213, 74, 0.95)",
        "rgba(255, 213, 74, 0.12)",
      );
    }

    if (selectionState.placement?.origin) {
      this.drawPlacement(selectionState.placement);
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

  drawResourceNode(resourceNode) {
    const sprite = this.assetLoader.getImage(resourceNode.sprite);
    const anchor = this.getEntityAnchor(resourceNode.occupiedTiles);
    const width = (sprite.naturalWidth || sprite.width) * this.camera.zoom;
    const height = (sprite.naturalHeight || sprite.height) * this.camera.zoom;

    this.ctx.save();
    if (resourceNode.depleted) {
      this.ctx.globalAlpha = 0.42;
    }
    this.ctx.drawImage(
      sprite,
      Math.round(anchor.x - width / 2),
      Math.round(anchor.y - height),
      width,
      height,
    );
    this.ctx.restore();

    if (resourceNode.depleted) {
      this.drawFootprint(resourceNode.occupiedTiles, "rgba(152, 163, 177, 0.7)", "rgba(56, 64, 76, 0.16)");
    }
  }

  drawBuilding(building) {
    const sprite = this.assetLoader.getImage(building.sprite);
    const anchor = this.getEntityAnchor(building.occupiedTiles);
    const width = (sprite.naturalWidth || sprite.width) * this.camera.zoom;
    const height = (sprite.naturalHeight || sprite.height) * this.camera.zoom;

    this.ctx.drawImage(
      sprite,
      Math.round(anchor.x - width / 2),
      Math.round(anchor.y - height),
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

  drawFootprint(tiles, strokeStyle, fillStyle) {
    for (const tile of tiles) {
      this.drawOutline(tile, strokeStyle, fillStyle);
    }
  }

  drawPlacement(placement) {
    const strokeStyle = placement.valid ? "rgba(88, 216, 160, 0.96)" : "rgba(255, 142, 82, 0.96)";
    const fillStyle = placement.valid ? "rgba(88, 216, 160, 0.16)" : "rgba(255, 142, 82, 0.18)";
    const tiles = placement.tiles.length > 0 ? placement.tiles : this.expandPlacementOutline(placement);
    this.drawFootprint(tiles, strokeStyle, fillStyle);
  }

  expandPlacementOutline(placement) {
    const tiles = [];
    const width = placement.footprint?.width ?? 0;
    const height = placement.footprint?.height ?? 0;

    if (!placement.origin) {
      return tiles;
    }

    for (let offsetY = 0; offsetY < height; offsetY += 1) {
      for (let offsetX = 0; offsetX < width; offsetX += 1) {
        tiles.push({
          x: placement.origin.x + offsetX,
          y: placement.origin.y + offsetY,
        });
      }
    }

    return tiles;
  }

  getEntityAnchor(occupiedTiles) {
    const anchor = occupiedTiles.reduce(
      (total, tile) => {
        const projected = this.tileToWorld(tile.x, tile.y);
        const screen = this.camera.worldToScreen(projected.x, projected.y);
        total.x += screen.x;
        total.y += screen.y + this.tileHeight * this.camera.zoom;
        return total;
      },
      { x: 0, y: 0 },
    );

    return {
      x: anchor.x / occupiedTiles.length,
      y: anchor.y / occupiedTiles.length,
    };
  }

  collectRenderableEntities(world) {
    return [
      ...world.resourceNodes.map((resourceNode) => ({ type: "resource", record: resourceNode })),
      ...(world.buildings ?? []).map((building) => ({ type: "building", record: building })),
    ].sort((left, right) => {
      if (left.record.sortKey !== right.record.sortKey) {
        return left.record.sortKey - right.record.sortKey;
      }

      if (left.record.y !== right.record.y) {
        return left.record.y - right.record.y;
      }

      if (left.record.x !== right.record.x) {
        return left.record.x - right.record.x;
      }

      if (left.type !== right.type) {
        return left.type.localeCompare(right.type);
      }

      return this.getRenderableEntityId(left.record).localeCompare(this.getRenderableEntityId(right.record));
    });
  }

  getRenderableEntityId(record) {
    return record.instanceId ?? record.resourceId ?? record.buildingId ?? "";
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
