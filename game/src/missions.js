// Kestrel Run — the three missions: what counts, what it pays, when it ends.
// Ring Run is a precision slalom, Island Hop is three landings in a row,
// Courier Dash is a race against the clock. Scoring rewards speed through
// rings and fuel left at the finish, so the fastest line is also the
// cheapest line.
import { CFG } from "./config.js";

export const MISSIONS = {
  "ring-run": {
    id: "ring-run",
    name: "Ring Run",
    short: "RING RUN",
    tagline: "Fly all ten gold rings, in order, without running dry.",
    detail: "10 rings · 8 km · one tank of fuel",
    ringsRequired: 10,
    landingsRequired: 0,
    timeLimit: 0,
  },
  "island-hop": {
    id: "island-hop",
    name: "Island Hop",
    short: "ISLAND HOP",
    tagline: "Put her down on all three strips. Each landing refuels you.",
    detail: "3 landings · 9.6 km · refuel on every strip",
    ringsRequired: 0,
    landingsRequired: 3,
    timeLimit: 0,
  },
  "courier-dash": {
    id: "courier-dash",
    name: "Courier Dash",
    short: "COURIER DASH",
    tagline: "The parcel must reach the beacon. Rings buy you time.",
    detail: "11 km · 150 s · each ring +12 s",
    ringsRequired: 0,
    landingsRequired: 0,
    timeLimit: 150,
  },
};

export function createMissionState(id) {
  return {
    id,
    def: MISSIONS[id],
    ringsPassed: 0,
    ringsTotal: MISSIONS[id].ringsRequired,
    bonusRings: 0,
    landings: 0,
    elapsed: 0,
    timeLeft: MISSIONS[id].timeLimit || 0,
    score: 0,
    done: false,
    failed: false,
    endReason: "",
    landingsDone: new Set(),
  };
}

// The next thing the HUD arrow should point at: ring, runway or beacon.
export function nextTarget(state) {
  const w = state.world;
  const p = state.plane;
  const m = state.mission;
  if (m.id === "ring-run") {
    const next = w.rings.find((r) => !r.passed && !r.missed);
    return next ? { kind: "ring", x: next.x, y: next.y, z: next.z } : null;
  }
  if (m.id === "island-hop") {
    const next = w.runways.find((rw) => rw.name.startsWith("STRIP") && !m.landingsDone.has(rw.name));
    if (next) return { kind: "runway", x: 0, y: 0, z: (next.z0 + next.z1) / 2, name: next.name };
    return null;
  }
  if (m.id === "courier-dash") {
    const next = w.rings.find((r) => !r.passed && !r.missed);
    if (next) return { kind: "ring", x: next.x, y: next.y, z: next.z, bonus: true };
    return w.beacon ? { kind: "beacon", x: 0, y: 0, z: w.beacon.z } : null;
  }
  return null;
}

export function objectiveText(state) {
  const m = state.mission;
  const p = state.plane;
  const t = nextTarget(state);
  const dist = (z) => `${Math.max(0, Math.round(z - p.z)).toLocaleString("en-US")} m`;
  if (m.id === "ring-run") {
    return t
      ? `RINGS ${m.ringsPassed}/${m.ringsTotal} · NEXT ${dist(t.z)}`
      : `RINGS ${m.ringsPassed}/${m.ringsTotal}`;
  }
  if (m.id === "island-hop") {
    return t
      ? `LANDINGS ${m.landings}/${m.landingsRequired} · ${t.name} ${dist(t.z)}`
      : `LANDINGS ${m.landings}/${m.landingsRequired}`;
  }
  const clock = ` · ${fmtClock(m.timeLeft)} LEFT`;
  return t
    ? `BEACON ${dist(t.z)}${t.kind === "ring" ? " · RING +12s" : ""}${clock}`
    : `BEACON ${dist(11000)}${clock}`;
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Apply one physics event to the mission: score, progress, completion.
export function applyEvent(state, ev) {
  const m = state.mission;
  const p = state.plane;
  const out = { message: null, sound: null };
  if (ev.type === "ring") {
    const speedBonus = Math.round((p.speed / CFG.MAX_SPEED) * 50);
    const pts = ev.ring.required ? CFG.RING_POINTS + speedBonus : 50;
    m.score += pts;
    if (ev.ring.required) m.ringsPassed++;
    else m.bonusRings++;
    if (m.id === "courier-dash") m.timeLeft += 12;
    out.message = ev.ring.required
      ? `RING ${m.ringsPassed}/${m.ringsTotal}  +${pts}`
      : `BONUS RING  +${pts}${m.id === "courier-dash" ? " · +12s" : ""}`;
    out.sound = "ring";
    if (m.id === "ring-run" && m.ringsPassed >= m.ringsTotal) finish(state, "All ten rings flown");
  } else if (ev.type === "missed-ring") {
    out.message = "RING MISSED — the course is broken";
    m.failed = true;
    m.endReason = "missed a ring";
  } else if (ev.type === "landed") {
    if (m.id === "island-hop" && ev.runway.name.startsWith("STRIP") && !m.landingsDone.has(ev.runway.name)) {
      m.landingsDone.add(ev.runway.name);
      m.landings++;
      m.score += CFG.LANDING_POINTS;
      p.fuel = CFG.FUEL_MAX;
      out.message = `${ev.runway.name} — TOUCHDOWN +${CFG.LANDING_POINTS} · TANK FULL`;
      out.sound = "thud";
      if (m.landings >= m.landingsRequired) finish(state, "All three strips landed");
    } else {
      p.fuel = CFG.FUEL_MAX;
      out.message = `${ev.runway.name} — TOUCHDOWN · TANK FULL`;
      out.sound = "thud";
    }
  } else if (ev.type === "beacon") {
    finish(state, "Parcel delivered to the beacon");
  } else if (ev.type === "crash") {
    m.failed = true;
    m.endReason = ev.reason;
    out.sound = "crash";
  } else if (ev.type === "damage") {
    out.message = `${ev.cause.toUpperCase()} — DAMAGE ${Math.round(p.damage)}%`;
  } else if (ev.type === "fuel-empty") {
    out.message = "FUEL EMPTY — GLIDING, FIND A RUNWAY";
  } else if (ev.type === "takeoff") {
    out.message = "AIRBORNE";
  }
  return out;
}

function finish(state, reason) {
  const m = state.mission;
  const p = state.plane;
  m.done = true;
  m.endReason = reason;
  const fuelBonus = Math.round(p.fuel) * 5;
  let timeBonus = 0;
  if (m.id === "courier-dash") timeBonus = Math.round(m.timeLeft) * 10;
  else if (m.id === "ring-run") timeBonus = Math.max(0, Math.round(300 - m.elapsed)) * 2;
  else timeBonus = Math.max(0, Math.round(420 - m.elapsed)) * 2;
  m.score += CFG.COMPLETE_BONUS + fuelBonus + timeBonus;
  m.completeBreakdown = { complete: CFG.COMPLETE_BONUS, fuel: fuelBonus, time: timeBonus };
}
