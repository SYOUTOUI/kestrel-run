// Kestrel Run — keyboard and mouse input.
// Keyboard is the primary control; the mouse only picks mission cards and
// buttons on the title and end screens. No pointer lock, no gamepad: the
// game must work the same in a plain desktop browser window.
import { clamp } from "./random.js";

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    // Held steering state, read by the flight model each frame.
    left: false,
    right: false,
    up: false, // pull up / climb
    down: false, // push down / descend
    throttleUp: false,
    throttleDown: false,
    // Edge-triggered actions, consumed by main.js once per press.
    pressed: new Set(),
    // Mouse position in canvas pixels (for card hit-testing).
    mouseX: -1,
    mouseY: -1,
    clicked: false,
    // Filled by render.js each frame with the clickable rects on screen.
    hotspots: [],
  };

  const KEYMAP = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ShiftLeft: "throttleUp",
    ShiftRight: "throttleUp",
    ControlLeft: "throttleDown",
    ControlRight: "throttleDown",
    KeyE: "throttleUp",
    KeyQ: "throttleDown",
  };

  window.addEventListener("keydown", (e) => {
    if (e.code === "Tab") return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) input.pressed.add(e.code);
    keys.add(e.code);
    const field = KEYMAP[e.code];
    if (field) input[field] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    const field = KEYMAP[e.code];
    if (field) input[field] = false;
  });
  window.addEventListener("blur", () => {
    keys.clear();
    input.left = input.right = input.up = input.down = false;
    input.throttleUp = input.throttleDown = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
    input.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
    input.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
    input.clicked = true;
  });

  // A hotspot hit this frame (title cards, buttons). Returns its id or null.
  input.hotspotHit = function () {
    if (!input.clicked) return null;
    input.clicked = false;
    for (const h of input.hotspots) {
      if (
        input.mouseX >= h.x &&
        input.mouseX <= h.x + h.w &&
        input.mouseY >= h.y &&
        input.mouseY <= h.y + h.h
      ) {
        return h.id;
      }
    }
    return null;
  };

  // Which hotspot the mouse is hovering, for the hover highlight.
  input.hoveredHotspot = function () {
    for (const h of input.hotspots) {
      if (
        input.mouseX >= h.x &&
        input.mouseX <= h.x + h.w &&
        input.mouseY >= h.y &&
        input.mouseY <= h.y + h.h
      ) {
        return h.id;
      }
    }
    return null;
  };

  input.consumePressed = function () {
    const p = input.pressed;
    input.pressed = new Set();
    return p;
  };

  return input;
}
