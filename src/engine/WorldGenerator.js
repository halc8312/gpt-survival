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

export class WorldGenerator {
  generate({ registry, seed, width, height, center }) {
    const tiles = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => this.createTile({ registry, seed, x, y, center })),
    );

    return { width, height, center, tiles };
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

  sample(seed, x, y) {
    const value = Math.sin((x + seed * 0.001) * 12.9898 + (y - seed * 0.001) * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }
}
