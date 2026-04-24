export class AssetLoader {
  constructor() {
    this.images = new Map();
    this.warnings = [];
    this.loadedImagesCount = 0;
  }

  async loadTileImages(tiles) {
    await this.loadImages(tiles.flatMap((tile) => tile.sprites ?? []));
  }

  async loadResourceImages(resources) {
    await this.loadImages(resources.map((resource) => resource.sprite).filter(Boolean));
  }

  async loadImages(paths) {
    const spritePaths = [...new Set(paths)];
    const missingPaths = spritePaths.filter((path) => !this.images.has(path));
    const loadedEntries = await Promise.all(missingPaths.map(async (path) => [path, await this.loadImage(path)]));

    for (const [path, image] of loadedEntries) {
      this.images.set(path, image);
    }

    this.loadedImagesCount = this.images.size;
  }

  async loadImage(path) {
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
        img.src = path;
      });

      return image;
    } catch (error) {
      this.warnings.push(error.message);
      return this.createPlaceholder(path);
    }
  }

  getImage(path) {
    return this.images.get(path) ?? this.createPlaceholder(path);
  }

  createPlaceholder(path) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.lineTo(0, canvas.height / 2);
    ctx.closePath();
    ctx.fillStyle = "#51126d";
    ctx.fill();
    ctx.strokeStyle = "#ffc0ff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffc0ff";
    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("MISSING", canvas.width / 2, canvas.height / 2 + 2);
    canvas.dataset.path = path;

    return canvas;
  }
}
