const BIOME_TILE_RULES = {
  biome_crash_plain: [
    { tileId: "tile_crash_scorched", threshold: 0.22 },
    { tileId: "tile_plain_soil", threshold: 0.72 },
    { tileId: "tile_grass_sparse", threshold: 1.0 },
  ],
  biome_rocky_field: [
    { tileId: "tile_rocky_ground", threshold: 0.55 },
    { tileId: "tile_bare_rock", threshold: 0.83 },
    { tileId: "tile_gravel_slope", threshold: 1.0 },
  ],
  biome_glow_forest: [
    { tileId: "tile_glow_moss", threshold: 0.42 },
    { tileId: "tile_forest_floor", threshold: 0.8 },
    { tileId: "tile_root_tangle", threshold: 1.0 },
  ],
  biome_shallow_marsh: [
    { tileId: "tile_shallow_water", threshold: 0.35 },
    { tileId: "tile_marsh_mud", threshold: 0.74 },
    { tileId: "tile_reed_bed", threshold: 1.0 },
  ],
};

const RESOURCE_TERRAIN_PREFERENCES = {
  resource_crash_debris: new Map([
    ["tile_crash_scorched", 5],
    ["tile_plain_soil", 4],
    ["tile_grass_sparse", 3],
    ["tile_rocky_ground", 2],
  ]),
  resource_loose_stone: new Map([
    ["tile_rocky_ground", 5],
    ["tile_bare_rock", 4],
    ["tile_gravel_slope", 4],
    ["tile_plain_soil", 2],
  ]),
  resource_iron_vein: new Map([
    ["tile_rocky_ground", 6],
    ["tile_bare_rock", 5],
    ["tile_gravel_slope", 5],
  ]),
  resource_fiber_reed: new Map([
    ["tile_reed_bed", 6],
    ["tile_marsh_mud", 5],
    ["tile_glow_moss", 4],
    ["tile_forest_floor", 4],
    ["tile_plain_soil", 1],
  ]),
  resource_luma_berry_bush: new Map([
    ["tile_plain_soil", 5],
    ["tile_grass_sparse", 4],
    ["tile_glow_moss", 4],
    ["tile_forest_floor", 4],
    ["tile_marsh_mud", 2],
  ]),
  resource_shallow_water: new Map([
    ["tile_shallow_water", 8],
    ["tile_marsh_mud", 5],
    ["tile_reed_bed", 4],
  ]),
  resource_power_wreck: new Map([
    ["tile_crash_scorched", 5],
    ["tile_rocky_ground", 4],
    ["tile_plain_soil", 3],
    ["tile_bare_rock", 2],
  ]),
  resource_data_pod: new Map([
    ["tile_crash_scorched", 6],
    ["tile_plain_soil", 4],
    ["tile_grass_sparse", 3],
  ]),
};

const RESOURCE_PLACEMENT_WEIGHTS = {
  biome: 100,
  terrain: 10,
  ring: 1,
  noise: 0.01,
};

const DEFAULT_INNER_TARGET_RADIUS = 8;
const DEFAULT_RING_SPAN = 1;

export class WorldGenerator {
  generate({ registry, seed, width, height, center }) {
    const tiles = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => this.createTile({ registry, seed, x, y, center })),
    );
    const { resourceNodes, resourceNodeGrid } = this.generateResourceNodes({
      registry,
      seed,
      width,
      height,
      center,
      tiles,
    });

    return { width, height, center, tiles, resourceNodes, resourceNodeGrid };
  }

  createTile({ registry, seed, x, y, center }) {
    const dx = x - center.x;
    const dy = y - center.y;
    const distance = Math.hypot(dx, dy);
    const baseNoise = this.sample(seed, x, y);
    const regionNoise = this.sample(seed * 7, x * 2, y * 2);
    let biomeId = "biome_crash_plain";

    if (distance >= 16) {
      const sector = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      const shiftedSector = (sector + (regionNoise - 0.5) * 0.1 + 1) % 1;

      if (shiftedSector < 0.34) {
        biomeId = "biome_rocky_field";
      } else if (shiftedSector < 0.67) {
        biomeId = "biome_glow_forest";
      } else {
        biomeId = "biome_shallow_marsh";
      }

      if (distance < 22 && baseNoise < 0.18) {
        biomeId = "biome_crash_plain";
      }
    }

    let tileNoise = this.sample(seed * 13, x * 3, y * 3);
    if (distance < 7) {
      tileNoise *= 0.4;
    } else if (biomeId === "biome_crash_plain") {
      tileNoise = 0.3 + tileNoise * 0.7;
    }

    const tileId = this.pickTileId(biomeId, tileNoise);
    const tile = registry.getTile(tileId);

    return {
      x,
      y,
      biomeId,
      tileId,
      buildable: Boolean(tile?.buildable),
      tile,
    };
  }

  pickTileId(biomeId, noise) {
    const rules = BIOME_TILE_RULES[biomeId] ?? BIOME_TILE_RULES.biome_crash_plain;
    return rules.find((rule) => noise <= rule.threshold)?.tileId ?? rules.at(-1).tileId;
  }

  generateResourceNodes({ registry, seed, width, height, center, tiles }) {
    const guarantees = registry.getMeta("mapGeneration")?.mvp?.resourceGuarantees ?? [];
    const resourceNodeGrid = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
    const resourceNodes = [];
    const radii = [...new Set(guarantees.map((guarantee) => guarantee.withinRadius))].sort((a, b) => a - b);
    const minRadiusByTier = new Map(radii.map((radius, index) => [radius, index === 0 ? 0 : radii[index - 1] + 1]));

    guarantees.forEach((guarantee, guaranteeIndex) => {
      const resource = registry.getResource(guarantee.resourceId);
      if (!resource) {
        return;
      }

      const footprint = this.getResourceFootprint(resource);
      const minRadius = minRadiusByTier.get(guarantee.withinRadius) ?? 0;
      const candidates = this.collectResourceCandidates({
        seed,
        guaranteeIndex,
        resource,
        tiles,
        center,
        footprint,
        minRadius,
        maxRadius: guarantee.withinRadius,
      });

      for (const candidate of candidates) {
        if (resourceNodes.filter((node) => node.resourceId === resource.id).length >= guarantee.minCount) {
          break;
        }

        if (!this.canPlaceResource(resourceNodeGrid, candidate.tiles)) {
          continue;
        }

        const index = resourceNodes.filter((node) => node.resourceId === resource.id).length + 1;
        const amount = this.rollAmount(resource.amountRange, seed, candidate.x, candidate.y, guaranteeIndex + index);
        const node = {
          instanceId: `${resource.id}_${String(index).padStart(2, "0")}`,
          resourceId: resource.id,
          name: resource.name,
          sprite: resource.sprite,
          x: candidate.x,
          y: candidate.y,
          amount,
          footprint,
          occupiedTiles: candidate.tiles.map((tile) => ({ x: tile.x, y: tile.y })),
          sortKey: candidate.tiles.at(-1).x + candidate.tiles.at(-1).y,
        };

        resourceNodes.push(node);
        for (const tile of candidate.tiles) {
          resourceNodeGrid[tile.y][tile.x] = node;
        }
      }
    });

    resourceNodes.sort((left, right) => {
      if (left.sortKey !== right.sortKey) {
        return left.sortKey - right.sortKey;
      }

      return left.instanceId.localeCompare(right.instanceId);
    });
    return { resourceNodes, resourceNodeGrid };
  }

  collectResourceCandidates({ seed, guaranteeIndex, resource, tiles, center, footprint, minRadius, maxRadius }) {
    const candidates = [];
    const targetRadius =
      minRadius > 0 ? (minRadius + maxRadius) / 2 : Math.min(maxRadius * 0.5, DEFAULT_INNER_TARGET_RADIUS);

    for (let y = 0; y <= tiles.length - footprint.height; y += 1) {
      for (let x = 0; x <= tiles[0].length - footprint.width; x += 1) {
        const footprintTiles = this.collectFootprintTiles(tiles, x, y, footprint);
        const anchorX = x + (footprint.width - 1) / 2;
        const anchorY = y + (footprint.height - 1) / 2;
        const distance = Math.hypot(anchorX - center.x, anchorY - center.y);

        if (distance > maxRadius || distance < minRadius) {
          continue;
        }

        const biomeScore = this.scoreBiomeFit(resource, footprintTiles);
        const terrainScore = this.scoreTerrainFit(resource, footprintTiles);
        const ringSpan = Math.max(DEFAULT_RING_SPAN, maxRadius - minRadius || maxRadius);
        const ringScore = 1 - Math.min(1, Math.abs(distance - targetRadius) / ringSpan);
        const noise = this.sample(seed * 31 + guaranteeIndex * 97, x * 5 + footprint.width, y * 5 + footprint.height);
        const score =
          biomeScore * RESOURCE_PLACEMENT_WEIGHTS.biome +
          terrainScore * RESOURCE_PLACEMENT_WEIGHTS.terrain +
          ringScore * RESOURCE_PLACEMENT_WEIGHTS.ring +
          noise * RESOURCE_PLACEMENT_WEIGHTS.noise;

        candidates.push({ x, y, tiles: footprintTiles, score });
      }
    }

    return candidates.sort((left, right) => right.score - left.score);
  }

  collectFootprintTiles(tiles, originX, originY, footprint) {
    const footprintTiles = [];

    for (let offsetY = 0; offsetY < footprint.height; offsetY += 1) {
      for (let offsetX = 0; offsetX < footprint.width; offsetX += 1) {
        footprintTiles.push(tiles[originY + offsetY][originX + offsetX]);
      }
    }

    return footprintTiles;
  }

  canPlaceResource(resourceNodeGrid, tiles) {
    return tiles.every((tile) => !resourceNodeGrid[tile.y][tile.x]);
  }

  getResourceFootprint(resource) {
    const [width = 1, height = 1] = resource.footprint ?? [1, 1];
    return { width, height };
  }

  scoreBiomeFit(resource, tiles) {
    const allowedBiomes = resource.allowedBiomes ?? [];
    if (allowedBiomes.length === 0) {
      return 2;
    }

    const matchingCount = tiles.filter((tile) => allowedBiomes.includes(tile.biomeId)).length;
    if (matchingCount === tiles.length) {
      return 3;
    }

    if (matchingCount > 0) {
      return 2;
    }

    return 1;
  }

  scoreTerrainFit(resource, tiles) {
    const preferences = RESOURCE_TERRAIN_PREFERENCES[resource.id];
    if (!preferences) {
      return 0;
    }

    return tiles.reduce((total, tile) => total + (preferences.get(tile.tileId) ?? 0), 0) / tiles.length;
  }

  rollAmount(amountRange, seed, x, y, salt) {
    const [min = 1, max = min] = amountRange ?? [1, 1];
    const noise = this.sample(seed * 17 + salt * 101, x * 7, y * 7);
    return Math.min(max, min + Math.floor(noise * (max - min + 1)));
  }

  sample(seed, x, y) {
    const value = Math.sin((x + seed * 0.001) * 12.9898 + (y - seed * 0.001) * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }
}
