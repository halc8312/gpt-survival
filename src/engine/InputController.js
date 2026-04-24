const KEY_BINDINGS = new Map([
  ["ArrowUp", [0, -1]],
  ["ArrowDown", [0, 1]],
  ["ArrowLeft", [-1, 0]],
  ["ArrowRight", [1, 0]],
  ["w", [0, -1]],
  ["s", [0, 1]],
  ["a", [-1, 0]],
  ["d", [1, 0]],
]);

export class InputController {
  constructor({ canvas, camera }) {
    this.canvas = canvas;
    this.camera = camera;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0 };
    this.drag = {
      active: false,
      moved: false,
      lastX: 0,
      lastY: 0,
      button: 0,
      distance: 0,
    };
    this.pendingClick = false;
    this.pendingBuildingShortcut = null;

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener("keydown", (event) => {
      if (KEY_BINDINGS.has(event.key)) {
        event.preventDefault();
        this.keys.add(event.key);
        return;
      }

      if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        this.pendingBuildingShortcut = event.key;
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key);
    });

    this.canvas.addEventListener("mousedown", (event) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = event.clientX - rect.left;
      this.mouse.y = event.clientY - rect.top;
      this.drag.active = true;
      this.drag.moved = false;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.drag.button = event.button;
      this.drag.distance = 0;
      this.canvas.classList.add("dragging");
    });

    window.addEventListener("mousemove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = event.clientX - rect.left;
      this.mouse.y = event.clientY - rect.top;

      if (!this.drag.active) {
        return;
      }

      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      this.drag.distance += Math.hypot(dx, dy);

      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        this.drag.moved = this.drag.moved || this.drag.distance > 3;
        if (this.drag.moved) {
          this.camera.panByScreen(dx, dy);
        }
      }

      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
    });

    window.addEventListener("mouseup", (event) => {
      if (!this.drag.active) {
        return;
      }

      if (event.button === this.drag.button && !this.drag.moved) {
        this.pendingClick = true;
      }

      this.drag.active = false;
      this.drag.moved = false;
      this.canvas.classList.remove("dragging");
    });

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        this.camera.zoomAt(this.mouse.x, this.mouse.y, zoomFactor);
      },
      { passive: false },
    );
  }

  update(deltaSeconds) {
    let x = 0;
    let y = 0;

    for (const key of this.keys) {
      const [dx, dy] = KEY_BINDINGS.get(key);
      x += dx;
      y += dy;
    }

    if (x === 0 && y === 0) {
      return;
    }

    const length = Math.hypot(x, y) || 1;
    const speed = 700 / this.camera.zoom;
    this.camera.panWorld((x / length) * speed * deltaSeconds, (y / length) * speed * deltaSeconds);
  }

  consumeClick() {
    const clicked = this.pendingClick;
    this.pendingClick = false;
    return clicked;
  }

  consumeBuildingShortcut() {
    const shortcut = this.pendingBuildingShortcut;
    this.pendingBuildingShortcut = null;
    return shortcut;
  }
}
