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

const POINTER_MOVE_THRESHOLD = {
  mouse: 4,
  pen: 6,
  touch: 10,
};

export class InputController {
  constructor({ canvas, camera }) {
    this.canvas = canvas;
    this.camera = camera;
    this.coarsePointerQuery = window.matchMedia("(pointer: coarse), (any-pointer: coarse)");
    this.keys = new Set();
    this.mouse = { x: 0, y: 0 };
    this.pointers = new Map();
    this.drag = {
      active: false,
      moved: false,
      lastX: 0,
      lastY: 0,
      pointerId: null,
      pointerType: "mouse",
      button: 0,
      distance: 0,
    };
    this.pinch = {
      active: false,
      pointerIds: [],
      lastDistance: 0,
      centerX: 0,
      centerY: 0,
    };
    this.tapCandidatePointerId = null;
    this.tapCancelled = false;
    this.pendingClick = null;
    this.pendingBuildingShortcut = null;
    this.pendingCancelBuild = false;
    this.pendingPlacementConfirm = false;
    this.pendingHarvest = false;
    this.pendingProductionStart = false;
    this.pendingRecipeCycle = 0;
    this.lastInteractionPointerType = "mouse";
    this.lastClickPointerType = "mouse";

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener("keydown", (event) => {
      if (KEY_BINDINGS.has(event.key)) {
        event.preventDefault();
        this.keys.add(event.key);
        return;
      }

      if (/^[1-8]$/.test(event.key)) {
        event.preventDefault();
        this.pendingBuildingShortcut = event.key;
        return;
      }

      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        this.pendingHarvest = true;
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this.pendingCancelBuild = true;
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        this.pendingPlacementConfirm = true;
        return;
      }

      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        this.pendingProductionStart = true;
        return;
      }

      if (event.key === "[" || event.key === "{") {
        event.preventDefault();
        this.pendingRecipeCycle = -1;
        return;
      }

      if (event.key === "]" || event.key === "}") {
        event.preventDefault();
        this.pendingRecipeCycle = 1;
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key);
    });

    this.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.handlePointerEnd(event));
    this.canvas.addEventListener("pointercancel", (event) => this.handlePointerEnd(event));

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        this.camera.zoomAt(this.mouse.x, this.mouse.y, zoomFactor);
      },
      { passive: false },
    );

    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }

  handlePointerDown(event) {
    this.updateMousePosition(event.clientX, event.clientY);
    this.lastInteractionPointerType = event.pointerType || "mouse";

    if (event.button === 2) {
      event.preventDefault();
      this.pendingCancelBuild = true;
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) {
      return;
    }

    event.preventDefault();
    this.canvas.setPointerCapture?.(event.pointerId);

    this.pointers.set(event.pointerId, {
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    });

    if (this.pointers.size >= 2) {
      this.startPinch();
      return;
    }

    this.drag.active = true;
    this.drag.moved = false;
    this.drag.pointerId = event.pointerId;
    this.drag.pointerType = event.pointerType || "mouse";
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
    this.drag.button = event.button;
    this.drag.distance = 0;
    this.tapCandidatePointerId = event.pointerId;
    this.tapCancelled = false;
    this.canvas.classList.add("dragging");
  }

  handlePointerMove(event) {
    const pointer = this.pointers.get(event.pointerId);
    this.updateMousePosition(event.clientX, event.clientY);

    if (!pointer) {
      return;
    }

    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size >= 2 && this.pinch.active) {
      event.preventDefault();
      this.updatePinchGesture();
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      return;
    }

    if (!this.drag.active || this.drag.pointerId !== event.pointerId) {
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      return;
    }

    event.preventDefault();
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
    this.drag.distance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);

    if (this.drag.distance > this.getMoveThreshold(pointer.pointerType)) {
      this.drag.moved = true;
      this.tapCancelled = true;
    }

    if (this.drag.moved && (dx !== 0 || dy !== 0)) {
      this.camera.panByScreen(dx, dy);
    }
  }

  handlePointerEnd(event) {
    const pointer = this.pointers.get(event.pointerId);
    this.updateMousePosition(event.clientX, event.clientY);

    if (!pointer) {
      return;
    }

    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (
      !this.pinch.active &&
      this.drag.pointerId === event.pointerId &&
      !this.drag.moved &&
      !this.tapCancelled &&
      this.tapCandidatePointerId === event.pointerId &&
      event.button !== 2
    ) {
      this.lastClickPointerType = pointer.pointerType || "mouse";
      this.pendingClick = {
        pointerType: this.lastClickPointerType,
        coarse: this.isCoarsePointer(),
      };
    }

    this.canvas.releasePointerCapture?.(event.pointerId);
    this.pointers.delete(event.pointerId);

    if (this.pointers.size >= 2) {
      this.startPinch();
      return;
    }

    if (this.pointers.size === 1) {
      const [remainingPointer] = this.pointers.values();
      this.pinch.active = false;
      this.tapCandidatePointerId = null;
      this.tapCancelled = true;
      this.drag.active = true;
      this.drag.moved = false;
      this.drag.pointerId = remainingPointer.pointerId;
      this.drag.pointerType = remainingPointer.pointerType;
      this.drag.lastX = remainingPointer.x;
      this.drag.lastY = remainingPointer.y;
      this.drag.button = remainingPointer.button;
      this.drag.distance = 0;
      remainingPointer.startX = remainingPointer.x;
      remainingPointer.startY = remainingPointer.y;
      remainingPointer.lastX = remainingPointer.x;
      remainingPointer.lastY = remainingPointer.y;
      this.canvas.classList.add("dragging");
      return;
    }

    this.resetPointerGestureState();
  }

  startPinch() {
    const pointers = Array.from(this.pointers.values()).slice(0, 2);
    if (pointers.length < 2) {
      return;
    }

    const centerX = (pointers[0].x + pointers[1].x) / 2;
    const centerY = (pointers[0].y + pointers[1].y) / 2;
    this.pinch.active = true;
    this.pinch.pointerIds = [pointers[0].pointerId, pointers[1].pointerId];
    this.pinch.lastDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
    this.pinch.centerX = centerX;
    this.pinch.centerY = centerY;
    this.drag.active = false;
    this.drag.moved = true;
    this.tapCandidatePointerId = null;
    this.tapCancelled = true;
    this.mouse.x = centerX - this.canvas.getBoundingClientRect().left;
    this.mouse.y = centerY - this.canvas.getBoundingClientRect().top;
    this.canvas.classList.add("dragging");
  }

  updatePinchGesture() {
    const pointers = this.pinch.pointerIds.map((pointerId) => this.pointers.get(pointerId)).filter(Boolean);
    if (pointers.length < 2) {
      return;
    }

    const centerX = (pointers[0].x + pointers[1].x) / 2;
    const centerY = (pointers[0].y + pointers[1].y) / 2;
    const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
    const moveX = centerX - this.pinch.centerX;
    const moveY = centerY - this.pinch.centerY;

    if (moveX !== 0 || moveY !== 0) {
      this.camera.panByScreen(moveX, moveY);
    }

    if (this.pinch.lastDistance > 0 && distance > 0) {
      this.camera.zoomAt(centerX - this.canvas.getBoundingClientRect().left, centerY - this.canvas.getBoundingClientRect().top, distance / this.pinch.lastDistance);
    }

    this.pinch.lastDistance = distance;
    this.pinch.centerX = centerX;
    this.pinch.centerY = centerY;
    this.mouse.x = centerX - this.canvas.getBoundingClientRect().left;
    this.mouse.y = centerY - this.canvas.getBoundingClientRect().top;
  }

  resetPointerGestureState() {
    this.drag.active = false;
    this.drag.moved = false;
    this.drag.pointerId = null;
    this.drag.distance = 0;
    this.pinch.active = false;
    this.pinch.pointerIds = [];
    this.pinch.lastDistance = 0;
    this.tapCandidatePointerId = null;
    this.tapCancelled = false;
    this.canvas.classList.remove("dragging");
  }

  updateMousePosition(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = clientX - rect.left;
    this.mouse.y = clientY - rect.top;
  }

  getMoveThreshold(pointerType) {
    return POINTER_MOVE_THRESHOLD[pointerType] ?? POINTER_MOVE_THRESHOLD.mouse;
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
    this.pendingClick = null;
    return clicked;
  }

  consumeBuildingShortcut() {
    const shortcut = this.pendingBuildingShortcut;
    this.pendingBuildingShortcut = null;
    return shortcut;
  }

  consumeCancelBuild() {
    const cancelled = this.pendingCancelBuild;
    this.pendingCancelBuild = false;
    return cancelled;
  }

  consumePlacementConfirm() {
    const confirmed = this.pendingPlacementConfirm;
    this.pendingPlacementConfirm = false;
    return confirmed;
  }

  consumeHarvest() {
    const harvesting = this.pendingHarvest;
    this.pendingHarvest = false;
    return harvesting;
  }

  consumeProductionStart() {
    const starting = this.pendingProductionStart;
    this.pendingProductionStart = false;
    return starting;
  }

  consumeRecipeCycle() {
    const direction = this.pendingRecipeCycle;
    this.pendingRecipeCycle = 0;
    return direction;
  }

  isCoarsePointer() {
    return this.coarsePointerQuery.matches;
  }

  requiresExplicitTouchPlacement(pointerType = this.lastClickPointerType) {
    return pointerType === "touch" || this.isCoarsePointer();
  }
}
