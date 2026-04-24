export class IsometricCamera {
  constructor({ minZoom = 0.5, maxZoom = 2.5 } = {}) {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.viewportWidth = 1;
    this.viewportHeight = 1;
  }

  setViewport(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  centerOn(worldX, worldY) {
    this.x = worldX;
    this.y = worldY;
  }

  panWorld(dx, dy) {
    this.x += dx;
    this.y += dy;
  }

  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  zoomAt(screenX, screenY, factor) {
    const nextZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    if (nextZoom === this.zoom) {
      return;
    }

    const worldPoint = this.screenToWorld(screenX, screenY);
    this.zoom = nextZoom;
    this.x = worldPoint.x - (screenX - this.viewportWidth / 2) / this.zoom;
    this.y = worldPoint.y - (screenY - this.viewportHeight / 2) / this.zoom;
  }

  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.x) * this.zoom + this.viewportWidth / 2,
      y: (worldY - this.y) * this.zoom + this.viewportHeight / 2,
    };
  }

  screenToWorld(screenX, screenY) {
    return {
      x: this.x + (screenX - this.viewportWidth / 2) / this.zoom,
      y: this.y + (screenY - this.viewportHeight / 2) / this.zoom,
    };
  }
}
