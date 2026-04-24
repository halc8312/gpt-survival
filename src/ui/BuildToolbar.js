const LABEL_PRIORITY = ["ja", "en"];

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

    summary.append(this.selectionElement, this.recipeElement);

    const palette = document.createElement("div");
    palette.className = "build-controls__palette";

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "build-controls__option";
      button.dataset.buildingId = option.buildingId;
      button.title = `${option.shortcut}: ${getBuildingLabel(option.building)}`;
      button.setAttribute("aria-label", `${option.shortcut}: ${getBuildingLabel(option.building)}`);
      button.addEventListener("click", () => this.onSelectBuilding(option.buildingId));

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
    this.harvestButton.addEventListener("click", () => this.onHarvest());

    this.productionButton = document.createElement("button");
    this.productionButton.type = "button";
    this.productionButton.className = "build-controls__action build-controls__action--production";
    this.productionButton.textContent = "生産";
    this.productionButton.addEventListener("click", () => this.onStartProduction());

    this.confirmButton = document.createElement("button");
    this.confirmButton.type = "button";
    this.confirmButton.className = "build-controls__action build-controls__action--confirm";
    this.confirmButton.textContent = "配置";
    this.confirmButton.addEventListener("click", () => this.onConfirmBuild());

    this.cancelButton = document.createElement("button");
    this.cancelButton.type = "button";
    this.cancelButton.className = "build-controls__action build-controls__action--cancel";
    this.cancelButton.textContent = "解除";
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

    if (this.statusElement) {
      this.statusElement.textContent = statusMessage ?? "";
      this.statusElement.classList.toggle("is-hidden", !statusMessage);
    }
  }
}
