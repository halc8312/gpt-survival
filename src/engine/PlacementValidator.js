export class PlacementValidator {
  constructor({ occupancyProviders = [] } = {}) {
    this.occupancyProviders = occupancyProviders;
  }

  validate({ world, origin, footprint }) {
    if (!origin || !footprint) {
      return { valid: false, reason: "no_hover_tile", tiles: [] };
    }

    const tiles = [];

    for (let offsetY = 0; offsetY < footprint.height; offsetY += 1) {
      for (let offsetX = 0; offsetX < footprint.width; offsetX += 1) {
        const x = origin.x + offsetX;
        const y = origin.y + offsetY;

        if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
          return { valid: false, reason: "out_of_bounds", tiles };
        }

        const tile = world.tiles[y][x];
        tiles.push(tile);

        if (!tile.buildable) {
          return { valid: false, reason: "tile_not_buildable", tiles };
        }
      }
    }

    for (const provider of this.occupancyProviders) {
      const result = provider({ world, origin, footprint, tiles });
      if (result?.blocked) {
        return { valid: false, reason: result.reason ?? "blocked", tiles };
      }
    }

    return { valid: true, reason: null, tiles };
  }

  static createResourceNodeBlocker() {
    return ({ world, tiles }) => {
      const blockedTile = tiles.find((tile) => world.resourceNodeGrid[tile.y][tile.x]);
      if (!blockedTile) {
        return null;
      }

      const resourceNode = world.resourceNodeGrid[blockedTile.y][blockedTile.x];
      return {
        blocked: true,
        reason: `resource_overlap:${resourceNode.resourceId}`,
      };
    };
  }

  static createPlacedBuildingBlocker() {
    return ({ world, tiles }) => {
      const blockedTile = tiles.find((tile) => world.buildingGrid?.[tile.y]?.[tile.x]);
      if (!blockedTile) {
        return null;
      }

      const building = world.buildingGrid[blockedTile.y][blockedTile.x];
      return {
        blocked: true,
        reason: `building_overlap:${building.buildingId}`,
      };
    };
  }
}
