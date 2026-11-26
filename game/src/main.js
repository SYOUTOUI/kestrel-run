// Kestrel Run — boot, state machine and the frame loop.
// Title -> flying -> (landed -> flying) -> complete / crashed / failed.
// ?seed=N replays the same valley; ?shot=start|play|end freezes one posed
// frame for screenshots. No network, no storage, no accounts.
import { CFG } from "./config.js";
import { createAudio } from "./audio.js";
import { createInput } from "./input.js";
import { createMissionState, MISSIONS, applyEvent } from "./missions.js";
import { createPlane, stepFlight } from "./physics.js";
import { clamp } from "./random.js";
import { render } from "./render.js";
import { applyShot } from "./shots.js";
import { buildWorld } from "./world.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get("seed"));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : 1 + Math.floor(Math.random() * 99998);
const shot = params.get("shot");

const input = createInput(canvas);
const audio = createAudio();

const state = {
  mode: "title",
  missionId: "ring-run",
  missions: MISSIONS,
  world: buildWorld(seed, "ring-run"),
  plane: createPlane(),
  camera: { x: 0, y: 4.5, z: 4, heading: 0, horizonY: CFG.HORIZON_Y },
  mission: createMissionState("ring-run"),
  time: 0,
  events: [],
  message: null,
  input,
  audio,
  _lastHit: 0,
};
// Park the plane on the home strip for the title backdrop.
state.plane.z = 300;
state.camera.z = 284;

function startMission(id) {
  state.missionId = id;
  state.world = buildWorld(seed, id);
  state.plane = createPlane();
  state.plane.z = 20;
  state.mission = createMissionState(id);
  state.camera = { x: 0, y: 4.5, z: 4, heading: 0, horizonY: CFG.HORIZON_Y };
  state.events = [];
  state.message = null;
  state.mode = "playing";
  audio.ensure();
  audio.click();
  showMessage(`MISSION: ${MISSIONS[id].name} — ${MISSIONS[id].tagline}`, 3.5);
}

function showMessage(text, secs = 2.5) {
  state.message = { text, until: state.time + secs };
}

function handlePressed(pressed) {
  const p = state.plane;
  if (pressed.has("KeyM")) audio.setMuted(!audio.muted);
  if (pressed.has("KeyR") && state.mode !== "title") startMission(state.missionId);
  if (pressed.has("KeyP") || pressed.has("Escape")) {
    if (state.mode === "playing" || state.mode === "landed") {
      state.mode = "paused";
      audio.stallBeep(false);
    } else if (state.mode === "paused") {
      state.mode = p.onGround ? "landed" : "playing";
    }
  }
  if (state.mode === "title") {
    if (pressed.has("Digit1")) state.missionId = "ring-run";
    if (pressed.has("Digit2")) state.missionId = "island-hop";
    if (pressed.has("Digit3")) state.missionId = "courier-dash";
    if (pressed.has("Enter") || pressed.has("Space")) startMission(state.missionId);
  }
  if (state.mode === "crashed" || state.mode === "complete" || state.mode === "failed") {
    if (pressed.has("Digit1")) startMission("ring-run");
    if (pressed.has("Digit2")) startMission("island-hop");
    if (pressed.has("Digit3")) startMission("courier-dash");
    if (pressed.has("Enter")) startMission(state.missionId);
  }
  if (pressed.has("Enter") || pressed.has("Space")) audio.ensure();
}

function consumeEvents() {
  for (const ev of state.events) {
    const out = applyEvent(state, ev);
    if (out.message) showMessage(out.message);
    if (out.sound === "ring") audio.ring();
    if (out.sound === "thud") audio.thud();
    if (out.sound === "crash") {
      audio.crash();
      audio.stallBeep(false);
    }
  }
  state.events = [];
  const m = state.mission;
  if (m.failed && (state.mode === "playing" || state.mode === "landed")) {
    state.mode = m.endReason.startsWith("missed") ? "failed" : "crashed";
  } else if (m.done && state.mode === "playing") {
    state.mode = "complete";
    audio.stallBeep(false);
  }
}

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;

  handlePressed(input.consumePressed());
  const hit = input.hotspotHit();
  if (hit && hit.startsWith("mission:")) {
    startMission(hit.slice("mission:".length));
  }

  if (state.mode === "playing" || state.mode === "landed") {
    state.time += dt;
    state.mission.elapsed += dt;
    if (state.mission.id === "courier-dash" && !state.mission.done) {
      state.mission.timeLeft -= dt;
      if (state.mission.timeLeft <= 0 && state.mode === "playing") {
        state.mission.failed = true;
        state.mission.endReason = "Out of time — the parcel never arrived";
        state.mode = "failed";
      }
    }
    stepFlight(state, input, dt);
    consumeEvents();
    // A touchdown switches to the rolling state; a takeoff switches back.
    if (state.mode === "playing" && state.plane.onGround && state.plane.speed < 62) {
      state.mode = "landed";
    } else if (state.mode === "landed" && !state.plane.onGround) {
      state.mode = "playing";
    }
    audio.setFlight(state.plane.throttle, state.plane.speed, true);
    audio.stallBeep(state.plane.stalled && state.mode === "playing");
  } else {
    audio.setFlight(0, 0, false);
  }

  render(ctx, state);
  requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state.mode === "playing" || state.mode === "landed")) {
    state.mode = "paused";
    audio.stallBeep(false);
  }
});

if (shot) {
  // Posed screenshot frame: render once, frozen, no loop, no audio.
  applyShot(state, shot);
  render(ctx, state);
  window.__kestrelBooted = true;
} else {
  render(ctx, state);
  window.__kestrelBooted = true;
  requestAnimationFrame(frame);
}
