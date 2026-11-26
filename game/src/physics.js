// Kestrel Run — the flight model and collisions.
// Arcade, but honest: throttle sets a target speed, bank turns the plane,
// lift needs speed, fuel is a real budget, and the ground only forgives a
// slow, level touchdown on a runway. Events are pushed to state.events for
// the main loop to score, sound and announce.
import { CFG } from "./config.js";
import { clamp, lerp } from "./random.js";

export function createPlane() {
  return {
    x: 0,
    y: 0,
    z: 20,
    speed: 0,
    throttle: 0,
    bank: 0, // radians, + = right wing down
    vs: 0, // vertical speed m/s
    heading: 0, // radians, 0 = straight down the valley
    fuel: CFG.FUEL_MAX,
    damage: 0,
    onGround: true,
    stalled: false,
    gearDown: true,
  };
}

export function stepFlight(state, input, dt) {
  const p = state.plane;
  const events = state.events;

  // --- throttle ------------------------------------------------------------
  if (input.throttleUp) p.throttle = clamp(p.throttle + 0.55 * dt, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - 0.8 * dt, 0, 1);

  // --- speed: chases the throttle's target, faster when diving -------------
  const target = CFG.MIN_SPEED + p.throttle * (CFG.MAX_SPEED - CFG.MIN_SPEED);
  const accel = p.vs < -2 ? CFG.ACCEL * 1.6 : CFG.ACCEL;
  p.speed += clamp(target - p.speed, -accel * 1.5 * dt, accel * dt);

  // --- bank and heading ----------------------------------------------------
  const bankTarget =
    (input.left ? -1 : 0) * (CFG.MAX_BANK_DEG * Math.PI) / 180 +
    (input.right ? 1 : 0) * (CFG.MAX_BANK_DEG * Math.PI) / 180;
  const bankRate = (CFG.BANK_RATE_DEG * Math.PI) / 180;
  p.bank += clamp(bankTarget - p.bank, -bankRate * dt, bankRate * dt);
  const turnRate = (9.81 * Math.tan(p.bank)) / Math.max(p.speed, 16);
  p.heading = clamp(p.heading + turnRate * dt, -0.62, 0.62);

  // --- pitch / vertical speed ----------------------------------------------
  const lift = clamp((p.speed - 16) / 16, 0, 1); // no lift authority when slow
  let climbTarget = 0;
  if (input.up) climbTarget = CFG.CLIMB_RATE * lift;
  if (input.down) climbTarget = -CFG.DESCEND_RATE;
  p.stalled = p.speed < CFG.STALL_SPEED && !p.onGround && p.y > 2;
  if (p.stalled) climbTarget = -6; // the nose drops, no arguing
  p.vs += clamp(climbTarget - p.vs, -4.5 * dt, 3.2 * dt);

  // --- position --------------------------------------------------------------
  p.x += Math.sin(p.heading) * p.speed * dt;
  p.z += Math.cos(p.heading) * p.speed * dt;
  if (!p.onGround) p.y += p.vs * dt;

  // --- fuel ------------------------------------------------------------------
  if (p.fuel > 0) {
    p.fuel -= (CFG.FUEL_BURN_IDLE + p.throttle * CFG.FUEL_BURN_FULL) * dt;
    if (p.fuel <= 0) {
      p.fuel = 0;
      p.throttle = Math.min(p.throttle, 0.15);
      events.push({ type: "fuel-empty" });
    }
  }

  // --- takeoff ---------------------------------------------------------------
  if (p.onGround && p.speed >= CFG.TAKEOFF_SPEED && input.up) {
    p.onGround = false;
    p.y = 0.5;
    p.vs = 2;
    events.push({ type: "takeoff" });
  }

  // --- ground contact ----------------------------------------------------------
  if (!p.onGround && p.y <= 0) {
    p.y = 0;
    const rw = runwayAt(state.world, p.x, p.z);
    const gentle = p.vs >= -4.5 && p.speed >= 20 && p.speed <= 62;
    const aligned = Math.abs(p.heading) < 0.35 && Math.abs(p.x) <= CFG.RUNWAY_HALF + 2;
    if (rw && gentle && aligned) {
      p.onGround = true;
      p.vs = 0;
      events.push({ type: "landed", runway: rw });
    } else if (p.vs < -6 || p.speed < 16) {
      events.push({
        type: "crash",
        reason: rw
          ? "came down too hard on the runway"
          : "hit the ground away from any runway",
      });
    } else if (p.vs < -4.5) {
      // Hard bounce: damage, back into the air, one warning.
      p.damage += 25;
      p.y = 2;
      p.vs = 2.5;
      p.speed *= 0.85;
      events.push({ type: "damage", amount: 25, cause: "hard bounce" });
      if (p.damage >= 100) events.push({ type: "crash", reason: "airframe gave out" });
    } else {
      // Slow, flat, off-runway: a ditch, not a landing.
      events.push({ type: "crash", reason: "ditched in a field" });
    }
  }

  // --- rolling on the ground ---------------------------------------------------
  if (p.onGround) {
    p.speed = Math.max(0, p.speed - 9 * dt); // brakes + rolling drag
    if (p.speed <= 0.5 && p.throttle < 0.1) p.speed = 0;
  }

  // --- obstacle strikes (trees, houses) -----------------------------------------
  if (!p.onGround && p.y < 22) {
    const seg = Math.floor(p.z / CFG.SEG_LEN);
    for (const t of treesNear(state, seg)) {
      if (Math.abs(p.z - t.z) < 4 && Math.abs(p.x - t.x) < 3.5 && p.y < t.h) {
        hitObstacle(state, events, "clipped a tree");
      }
    }
    for (const h of housesNear(state, seg)) {
      if (Math.abs(p.z - h.z) < 5 && Math.abs(p.x - h.x) < h.w / 2 + 3 && p.y < h.h + 2) {
        hitObstacle(state, events, "clipped a house roof");
      }
    }
  }

  // --- rings ----------------------------------------------------------------------
  for (const ring of state.world.rings) {
    if (ring.passed || ring.missed) continue;
    const dz = p.z - ring.z;
    if (dz > 6) {
      ring.missed = true;
      if (ring.required) events.push({ type: "missed-ring", ring });
      continue;
    }
    if (Math.abs(dz) <= 6) {
      const d = Math.hypot(p.x - ring.x, p.y - ring.y);
      if (d < ring.r) {
        ring.passed = true;
        ring.passedAt = state.time;
        events.push({ type: "ring", ring });
      }
    }
  }

  // --- beacon (courier finish) ------------------------------------------------------
  const beacon = state.world.beacon;
  if (beacon && p.z >= beacon.z && !state.mission.done) {
    events.push({ type: "beacon" });
  }

  // --- camera follows ---------------------------------------------------------------
  const cam = state.camera;
  cam.x = lerp(cam.x, p.x, 1 - Math.pow(0.001, dt));
  cam.y = lerp(cam.y, p.y + 4.5, 1 - Math.pow(0.0005, dt));
  cam.z = p.z - 16;
  cam.heading = lerp(cam.heading, p.heading, 1 - Math.pow(0.001, dt));
  cam.horizonY = CFG.HORIZON_Y - clamp(p.vs, -9, 9) * 5 - clamp(p.y, 0, 120) * 0.12;
}

function hitObstacle(state, events, cause) {
  const p = state.plane;
  if (state._lastHit && state.time - state._lastHit < 1.5) return;
  state._lastHit = state.time;
  p.damage += 40;
  p.y = Math.max(p.y, 24);
  p.vs = 3;
  p.speed *= 0.6;
  events.push({ type: "damage", amount: 40, cause });
  if (p.damage >= 100) events.push({ type: "crash", reason: cause + " — airframe gave out" });
}

// Lazy imports to avoid a cycle: world.js owns the scenery tables.
import { treesAt, housesAt } from "./world.js";

function treesNear(state, seg) {
  return [...treesAt(seg - 1), ...treesAt(seg), ...treesAt(seg + 1)];
}
function housesNear(state, seg) {
  return [...housesAt(seg - 1, state.world), ...housesAt(seg, state.world), ...housesAt(seg + 1, state.world)];
}

export function runwayAt(world, x, z) {
  for (const rw of world.runways) {
    if (z >= rw.z0 && z <= rw.z1 && Math.abs(x) <= CFG.RUNWAY_HALF + 2) return rw;
  }
  return null;
}

export function onAnyRunway(world, z) {
  return world.runways.some((rw) => z >= rw.z0 && z <= rw.z1);
}
