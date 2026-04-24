const LABEL_PRIORITY = ["ja", "en"];
const PASSIVE_EVENT_NAMES = new Set(["wheel"]);
const SWIPE_THRESHOLD_PX = 12;
const SWIPE_CLICK_SUPPRESSION_MS = 250;

const getBuildingLabel = (building) =>
  LABEL_PRIORITY.map((locale) => building?.name?.[locale]).find(Boolean) ?? building?.id ?? "—";

export class BuildToolbar {
  constructor(element, { onSelectBuilding, onCancelBuild, onConfirmBuild, onHarvest, onStartProduction }) {
    this.element = element;
    this.onSelectBuilding = onSelectBuilding;
    this.onCancelBuild = onCancelBuild;
    this.onConfirmBuild = onConfirmBuild;
    this.onHarvest = onHarvest;
    this.onStartProduction = onStartProduction;
    this.buildButtons = new Map();
    this.confirmButton = null;
    this.cancelButton = null;
    this.harvestButton = null;
    this.productionButton = null;
    this.statusElement = null;
    this.selectionElement = null;
    this.recipeElement = null;
    this.powerElement = null;
    this.palettePointer = null;
    this.suppressPaletteClickUntil = 0;
  }

  setOptions(options) {
    this.buildButtons.clear();
    this.element.replaceChildren();

    const summary = document.createElement("div");
    summary.className = "build-controls__summary";

    this.selectionElement = document.createElement("div");
    this.selectionElement.className = "build-controls__selection";

    this.recipeElement = document.createElement("div");
    this.recipeElement.className = "build-controls__recipe";

    this.powerElement = document.createElement("div");
    this.powerElement.className = "build-controls__power";

    summary.append(this.selectionElement, this.recipeElement, this.powerElement);

    const palette = document.createElement("div");
    palette.className = "build-controls__palette";
    this.bindPaletteInteractions(palette);

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "build-controls__option";
      button.dataset.buildingId = option.buildingId;
      button.title = `${option.shortcut}: ${getBuildingLabel(option.building)}`;
      button.setAttribute("aria-label", `${option.shortcut}: ${getBuildingLabel(option.building)}`);
      this.decorateInteractiveElement(button);
      button.addEventListener("click", (event) => {
        if (this.shouldSuppressPaletteClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        this.onSelectBuilding(option.buildingId);
      });

      const shortcut = document.createElement("span");
      shortcut.className = "build-controls__shortcut";
      shortcut.textContent = option.shortcut;

      const label = document.createElement("span");
      label.className = "build-controls__label";
      label.textContent = getBuildingLabel(option.building);

      button.append(shortcut, label);
      palette.append(button);
      this.buildButtons.set(option.buildingId, button);
    }

    const actions = document.createElement("div");
    actions.className = "build-controls__actions";

    this.harvestButton = document.createElement("button");
    this.harvestButton.type = "button";
    this.harvestButton.className = "build-controls__action build-controls__action--harvest";
    this.harvestButton.textContent = "採取";
    this.decorateInteractiveElement(this.harvestButton);
    this.harvestButton.addEventListener("click", () => this.onHarvest());

    this.productionButton = document.createElement("button");
    this.productionButton.type = "button";
    this.productionButton.className = "build-controls__action build-controls__action--production";
    this.productionButton.textContent = "生産";
    this.decorateInteractiveElement(this.productionButton);
    this.productionButton.addEventListener("click", () => this.onStartProduction());

    this.confirmButton = document.createElement("button");
    this.confirmButton.type = "button";
    this.confirmButton.className = "build-controls__action build-controls__action--confirm";
    this.confirmButton.textContent = "配置";
    this.decorateInteractiveElement(this.confirmButton);
    this.confirmButton.addEventListener("click", () => this.onConfirmBuild());

    this.cancelButton = document.createElement("button");
    this.cancelButton.type = "button";
    this.cancelButton.className = "build-controls__action build-controls__action--cancel";
    this.cancelButton.textContent = "解除";
    this.decorateInteractiveElement(this.cancelButton);
    this.cancelButton.addEventListener("click", () => this.onCancelBuild());

    this.statusElement = document.createElement("div");
    this.statusElement.className = "build-controls__status";

    actions.append(this.harvestButton, this.productionButton, this.confirmButton, this.cancelButton);
    this.element.append(summary, palette, actions, this.statusElement);
  }

  render({
    activeBuildingId,
    buildMode,
    placementValid,
    canHarvest,
    canStartProduction,
    statusMessage,
    selectionSummary,
    recipeSummary,
    powerSummary,
  }) {
    for (const [buildingId, button] of this.buildButtons) {
      const active = buildMode && buildingId === activeBuildingId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }

    if (this.confirmButton) {
      this.confirmButton.disabled = !buildMode || !placementValid;
    }

    if (this.cancelButton) {
      this.cancelButton.disabled = !buildMode;
    }

    if (this.harvestButton) {
      this.harvestButton.disabled = !canHarvest;
    }

    if (this.productionButton) {
      this.productionButton.disabled = !canStartProduction;
    }

    if (this.selectionElement) {
      this.selectionElement.textContent = selectionSummary ?? "";
      this.selectionElement.classList.toggle("is-hidden", !selectionSummary);
    }

    if (this.recipeElement) {
      this.recipeElement.textContent = recipeSummary ?? "";
      this.recipeElement.classList.toggle("is-hidden", !recipeSummary);
    }

    if (this.powerElement) {
      this.powerElement.textContent = powerSummary ?? "";
      this.powerElement.classList.toggle("is-hidden", !powerSummary);
    }

    if (this.statusElement) {
      this.statusElement.textContent = statusMessage ?? "";
      this.statusElement.classList.toggle("is-hidden", !statusMessage);
    }
  }

  decorateInteractiveElement(element) {
    for (const eventName of ["pointerdown", "pointerup", "pointercancel", "wheel"]) {
      element.addEventListener(
        eventName,
        (event) => {
          event.stopPropagation();
        },
        { passive: PASSIVE_EVENT_NAMES.has(eventName) },
      );
    }
  }

  bindPaletteInteractions(palette) {
    for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel"]) {
      palette.addEventListener(
        eventName,
        (event) => {
          event.stopPropagation();
        },
        { passive: PASSIVE_EVENT_NAMES.has(eventName) },
      );
    }

    palette.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      this.palettePointer = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    });

    palette.addEventListener("pointermove", (event) => {
      if (!this.palettePointer || this.palettePointer.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - this.palettePointer.startX;
      const deltaY = event.clientY - this.palettePointer.startY;
      if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY)) {
        this.palettePointer.moved = true;
        this.suppressPaletteClickUntil = performance.now() + SWIPE_CLICK_SUPPRESSION_MS;
      }
    });

    const releasePointer = (event) => {
      if (!this.palettePointer || this.palettePointer.pointerId !== event.pointerId) {
        return;
      }

      if (this.palettePointer.moved) {
        this.suppressPaletteClickUntil = performance.now() + SWIPE_CLICK_SUPPRESSION_MS;
      }
      this.palettePointer = null;
    };

    palette.addEventListener("pointerup", releasePointer);
    palette.addEventListener("pointercancel", releasePointer);
  }

  shouldSuppressPaletteClick() {
    return performance.now() < this.suppressPaletteClickUntil;
  }
}
