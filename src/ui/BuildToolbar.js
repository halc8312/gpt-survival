const LABEL_PRIORITY = ["ja", "en"];

const getBuildingLabel = (building) =>
  LABEL_PRIORITY.map((locale) => building?.name?.[locale]).find(Boolean) ?? building?.id ?? "—";

export class BuildToolbar {
  constructor(element, { onSelectBuilding, onCancelBuild, onConfirmBuild }) {
    this.element = element;
    this.onSelectBuilding = onSelectBuilding;
    this.onCancelBuild = onCancelBuild;
    this.onConfirmBuild = onConfirmBuild;
    this.buildButtons = new Map();
    this.confirmButton = null;
    this.cancelButton = null;
  }

  setOptions(options) {
    this.buildButtons.clear();
    this.element.replaceChildren();

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

    actions.append(this.confirmButton, this.cancelButton);
    this.element.append(palette, actions);
  }

  render({ activeBuildingId, buildMode, placementValid }) {
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
  }
}
