// Kestrel Run — posed frames for the three screenshots.
// Each shot freezes the same world (?seed=1) at a chosen moment, so the
// screenshots are real renders of the game, not mock-ups:
//   start — the title screen, plane parked on the home strip at dawn.
//   play  — mid-flight, banking through the next ring, HUD lit.
//   end   — mission complete, rolling out on the refuel strip.
import { CFG } from "./config.js";

export function applyShot(state, shot) {
  const p = state.plane;
  const cam = state.camera;
  const m = state.mission;
  state.time = 0;

  if (shot === "start") {
    state.mode = "title";
    state.missionId = "ring-run";
    p.x = 0;
    p.y = 0;
    p.z = 300;
    p.speed = 0;
    p.throttle = 0;
    p.bank = 0;
    p.vs = 0;
    p.heading = 0;
    p.onGround = true;
    p.fuel = CFG.FUEL_MAX;
    cam.x = 0;
    cam.y = 4.5;
    cam.z = 284;
    cam.heading = 0;
    cam.horizonY = CFG.HORIZON_Y;
    state.time = 0.6;
    return;
  }

  if (shot === "play") {
    state.mode = "playing";
    state.missionId = "ring-run";
    // Rings 0-2 already flown; the next ring (z 3300) is dead ahead.
    state.world.rings.forEach((r, i) => {
      if (i < 3) {
        r.passed = true;
        r.passedAt = -10;
      }
    });
    m.ringsPassed = 3;
    m.score = 342;
    m.elapsed = 52;
    p.x = -26;
    p.y = 58;
    p.z = 2910;
    p.speed = 62;
    p.throttle = 0.72;
    p.bank = -0.3;
    p.vs = 1.2;
    p.heading = -0.12;
    p.fuel = 78;
    p.onGround = false;
    p.damage = 0;
    cam.x = -24;
    cam.y = 62;
    cam.z = 2894;
    cam.heading = -0.12;
    cam.horizonY = CFG.HORIZON_Y - 6;
    state.time = 6.2;
    state.message = { text: "RING 3/10  +118", until: 8.4 };
    return;
  }

  if (shot === "end") {
    state.mode = "complete";
    state.missionId = "ring-run";
    state.world.rings.forEach((r) => {
      r.passed = true;
      r.passedAt = -10;
    });
    m.ringsPassed = 10;
    m.score = 1240;
    m.elapsed = 168;
    m.done = true;
    m.endReason = "All ten rings flown";
    m.completeBreakdown = { complete: 500, fuel: 170, time: 264 };
    p.x = 0;
    p.y = 0;
    p.z = 4520;
    p.speed = 12;
    p.throttle = 0.1;
    p.bank = 0;
    p.vs = 0;
    p.heading = 0;
    p.fuel = 34;
    p.onGround = true;
    p.damage = 0;
    cam.x = 0;
    cam.y = 4.5;
    cam.z = 4504;
    cam.heading = 0;
    cam.horizonY = CFG.HORIZON_Y;
    state.time = 3.0;
    return;
  }
}
