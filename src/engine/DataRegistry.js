const DEFAULT_SPECIAL_UNLOCKS = new Set(["starting_core"]);

export class DataRegistry {
  constructor() {
    this.meta = new Map();
    this.collections = new Map();
    this.loadedFiles = [];
    this.optionalWarnings = [];
    this.validation = { ok: true, errors: [], warnings: [] };
  }

  async load(fileDescriptors) {
    const results = await Promise.all(fileDescriptors.map((descriptor) => this.loadFile(descriptor)));

    for (const result of results) {
      if (!result) {
        continue;
      }

      const { descriptor, data } = result;
      this.loadedFiles.push(descriptor.path);
      this.meta.set(descriptor.key, data);

      if (descriptor.collection && descriptor.recordKey) {
        const records = Array.isArray(data[descriptor.recordKey]) ? data[descriptor.recordKey] : [];
        this.collections.set(descriptor.collection, records);
      }
    }
  }

  async loadFile(descriptor) {
    try {
      const response = await fetch(descriptor.path);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return {
        descriptor,
        data: await response.json(),
      };
    } catch (error) {
      if (descriptor.optional) {
        this.optionalWarnings.push(`Optional file missing: ${descriptor.path}`);
        return null;
      }

      throw new Error(`Failed to load ${descriptor.path}: ${error.message}`);
    }
  }

  validate() {
    const errors = [];
    const warnings = [...this.optionalWarnings];

    this.validateUniqueIds("items", errors);
    this.validateUniqueIds("tiles", errors);
    this.validateUniqueIds("resources", errors);
    this.validateUniqueIds("buildings", errors);
    this.validateUniqueIds("recipes", errors);
    this.validateUniqueIds("research", errors);

    const itemIds = this.getIdSet("items");
    const buildingIds = this.getIdSet("buildings");
    const researchIds = this.getIdSet("research");
    const assetPaths = new Set((this.meta.get("assetManifest")?.assets ?? []).map((asset) => asset.path));

    for (const recipe of this.getAll("recipes")) {
      this.ensureItemReferences(`Recipe ${recipe.id} input`, recipe.inputs, itemIds, errors);
      this.ensureItemReferences(`Recipe ${recipe.id} output`, recipe.outputs, itemIds, errors);

      if (recipe.buildingId && !buildingIds.has(recipe.buildingId)) {
        errors.push(`Recipe ${recipe.id} references missing building ID: ${recipe.buildingId}`);
      }
    }

    for (const building of this.getAll("buildings")) {
      this.ensureItemReferences(`Building ${building.id} buildCost`, building.buildCost, itemIds, errors);

      if (
        building.unlockedBy &&
        !DEFAULT_SPECIAL_UNLOCKS.has(building.unlockedBy) &&
        !researchIds.has(building.unlockedBy)
      ) {
        errors.push(`Building ${building.id} references missing research ID: ${building.unlockedBy}`);
      }
    }

    for (const resource of this.getAll("resources")) {
      this.ensureItemReferences(`Resource ${resource.id} primaryDrops`, resource.primaryDrops, itemIds, errors);
    }

    for (const tile of this.getAll("tiles")) {
      for (const spritePath of tile.sprites ?? []) {
        if (assetPaths.size > 0 && !assetPaths.has(spritePath)) {
          warnings.push(`Tile ${tile.id} sprite path is not listed in asset manifest: ${spritePath}`);
        }
      }
    }

    this.validation = {
      ok: errors.length === 0,
      errors,
      warnings,
    };

    return this.validation;
  }

  validateUniqueIds(type, errors) {
    const seen = new Set();

    for (const record of this.getAll(type)) {
      if (seen.has(record.id)) {
        errors.push(`Duplicate ${type} ID: ${record.id}`);
        continue;
      }

      seen.add(record.id);
    }
  }

  ensureItemReferences(label, references, validIds, errors) {
    for (const id of Object.keys(references ?? {})) {
      if (!validIds.has(id)) {
        errors.push(`${label} references missing item ID: ${id}`);
      }
    }
  }

  getIdSet(type) {
    return new Set(this.getAll(type).map((record) => record.id));
  }

  getMeta(key) {
    return this.meta.get(key);
  }

  getAll(type) {
    return this.collections.get(type) ?? [];
  }

  get(type, id) {
    return this.getAll(type).find((record) => record.id === id) ?? null;
  }

  has(type, id) {
    return this.getAll(type).some((record) => record.id === id);
  }

  getItem(id) {
    return this.get("items", id);
  }

  getTile(id) {
    return this.get("tiles", id);
  }

  getBiome(id) {
    return this.get("biomes", id);
  }

  getResource(id) {
    return this.get("resources", id);
  }

  getBuilding(id) {
    return this.get("buildings", id);
  }

  getRecipe(id) {
    return this.get("recipes", id);
  }

  getRecipesByBuildingId(buildingId) {
    return this.getAll("recipes").filter((recipe) => recipe.buildingId === buildingId);
  }

  getResearch(id) {
    return this.get("research", id);
  }

  getCreature(id) {
    return this.get("creatures", id);
  }
}
