import { Game } from "./engine/Game.js";

const canvas = document.getElementById("game-canvas");
const debugElement = document.getElementById("debug-overlay");
const buildControlsElement = document.getElementById("build-controls");
const errorPanel = document.getElementById("error-panel");
const errorMessage = document.getElementById("error-message");

const showError = (error) => {
  errorPanel.classList.remove("hidden");
  errorMessage.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
};

const boot = async () => {
  try {
    const game = new Game({ canvas, debugElement, buildControlsElement, errorPanel });
    await game.init();
    game.start();
    window.stardustColony = game;
  } catch (error) {
    showError(error);
  }
};

boot();
