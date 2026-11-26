// Kestrel Run — everything on screen.
// The world layer (sky, valley, scenery, rings) is drawn rotated by the
// bank, so turns feel like turns; the plane and the HUD stay level with the
// screen, like a real chase camera with a stabilised instrument panel.
import { CFG, PALETTE } from "./config.js";
import { clamp, hash1, lerp } from "./random.js";
import { fieldColor, housesAt, project, riverX, treesAt } from "./world.js";
import { fmtClock, nextTarget, objectiveText } from "./missions.js";

const W = CFG.VIEW_W;
const H = CFG.VIEW_H;

export function render(ctx, state) {
  const p = state.plane;
  ctx.clearRect(0, 0, W, H);

  // World layer, rolled by the bank.
  ctx.save();
  ctx.translate(W / 2, H * 0.58);
  ctx.rotate(-p.bank * 0.45);
  ctx.translate(-W / 2, -H * 0.58);
  drawSky(ctx, state);
  drawGround(ctx, state);
  drawScenery(ctx, state);
  drawRings(ctx, state);
  drawBeacon(ctx, state);
  ctx.restore();

  drawPlaneShadow(ctx, state);
  drawPlane(ctx, state);

  if (state.mode !== "title") drawHUD(ctx, state);
  if (state.mode === "title") drawTitle(ctx, state);
  if (state.mode === "paused") drawCenterCard(ctx, "PAUSED", "P — resume · R — restart");
  if (state.mode === "crashed") drawEndCard(ctx, state, "DOWN", false);
  if (state.mode === "complete") drawEndCard(ctx, state, "MISSION COMPLETE", true);
  if (state.mode === "failed") drawEndCard(ctx, state, "COURSE BROKEN", false);
  if (state.mode === "landed") drawLandedHint(ctx, state);
}

// --- sky ---------------------------------------------------------------------
function drawSky(ctx, state) {
  const cam = state.camera;
  const hy = cam.horizonY;
  const g = ctx.createLinearGradient(0, 0, 0, hy + 40);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.55, PALETTE.skyMid);
  g.addColorStop(0.85, PALETTE.skyLow);
  g.addColorStop(1, PALETTE.horizonGlow);
  ctx.fillStyle = g;
  // Overscanned: the world layer rolls with the bank, so the sky must cover
  // the corners even at full bank.
  ctx.fillRect(-500, -500, W + 1000, hy + 700);

  // Low sun, right of centre.
  const sunX = W * 0.72 - cam.heading * 160;
  const sunY = hy - 96;
  const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  sg.addColorStop(0, PALETTE.sunCore);
  sg.addColorStop(0.35, PALETTE.sun);
  sg.addColorStop(1, "rgba(255, 190, 110, 0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.sunCore;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();

  // Mountain ridges, parallaxed by heading.
  drawRidge(ctx, state.world.ridgeFar, hy, -cam.heading * 260, PALETTE.mountainFar, 0.9);
  drawRidge(ctx, state.world.ridgeNear, hy, -cam.heading * 430, PALETTE.mountainNear, 1);

  // Clouds.
  for (const c of state.world.clouds) {
    const pr = project(cam, c.x, c.y, c.z);
    if (pr.behind || pr.sx < -200 || pr.sx > W + 200 || pr.sy < -40) continue;
    const r = c.s * pr.s;
    ctx.fillStyle = "rgba(255, 244, 230, 0.85)";
    ctx.beginPath();
    ctx.ellipse(pr.sx, pr.sy, r, r * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(pr.sx - r * 0.55, pr.sy + r * 0.08, r * 0.62, r * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(pr.sx + r * 0.6, pr.sy + r * 0.06, r * 0.55, r * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(pr.sx - r * 0.1, pr.sy - r * 0.16, r * 0.5, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRidge(ctx, pts, hy, offset, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-80, hy + 2);
  for (const pt of pts) ctx.lineTo(pt.x + offset - 400, hy - pt.h);
  ctx.lineTo(W + 80, hy + 2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

// --- ground ------------------------------------------------------------------
function drawGround(ctx, state) {
  const cam = state.camera;
  const camSeg = Math.floor(cam.z / CFG.SEG_LEN);
  for (let i = camSeg + CFG.DRAW_SEGMENTS - 1; i >= camSeg; i--) {
    const z0 = i * CFG.SEG_LEN;
    const z1 = z0 + CFG.SEG_LEN;
    const a = project(cam, -CFG.GROUND_HALF, 0, z0);
    const b = project(cam, CFG.GROUND_HALF, 0, z0);
    const c = project(cam, CFG.GROUND_HALF, 0, z1);
    const d = project(cam, -CFG.GROUND_HALF, 0, z1);
    if (!a || !b || !c || !d) continue;
    // Field.
    ctx.fillStyle = fieldColor(i);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.lineTo(d.sx, d.sy);
    ctx.closePath();
    ctx.fill();
    // Hedgerow on the near edge, sometimes.
    if (hash1(i, 9) < 0.3) {
      ctx.strokeStyle = "rgba(30, 50, 20, 0.5)";
      ctx.lineWidth = Math.max(1, 2.2 * d.s);
      ctx.beginPath();
      ctx.moveTo(d.sx, d.sy);
      ctx.lineTo(c.sx, c.sy);
      ctx.stroke();
    }
    drawRiverBand(ctx, cam, z0, z1);
    drawRoad(ctx, cam, z0, z1);
    drawRunwayBand(ctx, state, i, z0, z1);
  }
}

function quad(ctx, p1, p2, p3, p4, fill) {
  if (!p1 || !p2 || !p3 || !p4) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(p1.sx, p1.sy);
  ctx.lineTo(p2.sx, p2.sy);
  ctx.lineTo(p3.sx, p3.sy);
  ctx.lineTo(p4.sx, p4.sy);
  ctx.closePath();
  ctx.fill();
}

function drawRiverBand(ctx, cam, z0, z1) {
  const rx0 = riverX(z0);
  const rx1 = riverX(z1);
  quad(
    ctx,
    project(cam, rx0 - 11, 0.05, z0),
    project(cam, rx0 + 11, 0.05, z0),
    project(cam, rx1 + 11, 0.05, z1),
    project(cam, rx1 - 11, 0.05, z1),
    PALETTE.river,
  );
}

function drawRoad(ctx, cam, z0, z1) {
  quad(
    ctx,
    project(cam, -93, 0.05, z0),
    project(cam, -87, 0.05, z0),
    project(cam, -87, 0.05, z1),
    project(cam, -93, 0.05, z1),
    PALETTE.road,
  );
}

function drawRunwayBand(ctx, state, seg, z0, z1) {
  const cam = state.camera;
  for (const rw of state.world.runways) {
    if (z1 < rw.z0 || z0 > rw.z1) continue;
    const hw = CFG.RUNWAY_HALF;
    quad(
      ctx,
      project(cam, -hw, 0.08, Math.max(z0, rw.z0)),
      project(cam, hw, 0.08, Math.max(z0, rw.z0)),
      project(cam, hw, 0.08, Math.min(z1, rw.z1)),
      project(cam, -hw, 0.08, Math.min(z1, rw.z1)),
      PALETTE.runway,
    );
    // Centre dashes.
    const mid = (z0 + z1) / 2;
    if (mid > rw.z0 + 40 && mid < rw.z1 - 40) {
      quad(
        ctx,
        project(cam, -0.9, 0.12, mid - 18),
        project(cam, 0.9, 0.12, mid - 18),
        project(cam, 0.9, 0.12, mid + 18),
        project(cam, -0.9, 0.12, mid + 18),
        PALETTE.runwayMark,
      );
    }
    // Threshold bars at the runway start.
    if (z0 <= rw.z0 && z1 > rw.z0) {
      quad(
        ctx,
        project(cam, -9, 0.12, rw.z0 + 2),
        project(cam, 9, 0.12, rw.z0 + 2),
        project(cam, 9, 0.12, rw.z0 + 14),
        project(cam, -9, 0.12, rw.z0 + 14),
        PALETTE.runwayMark,
      );
    }
    // Edge lights, close up only. Radius capped: near the camera the raw
    // projection would turn each light into a giant glowing orb.
    const midPr = project(cam, 0, 0, mid);
    if (midPr && !midPr.behind && midPr.fwd < 1800) {
      for (const sx of [-hw, hw]) {
        const lp = project(cam, sx, 0.4, mid);
        if (lp.behind) continue;
        ctx.fillStyle = "#ffe9a8";
        ctx.shadowColor = "#ffbf47";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(lp.sx, lp.sy, Math.min(4, Math.max(1.5, 2.4 * lp.s)), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
}

// --- scenery -----------------------------------------------------------------
function drawScenery(ctx, state) {
  const cam = state.camera;
  const camSeg = Math.floor(cam.z / CFG.SEG_LEN);
  const items = [];
  for (let i = camSeg; i < camSeg + CFG.DRAW_SEGMENTS; i++) {
    for (const t of treesAt(i)) items.push({ kind: "tree", z: t.z, ...t });
    for (const h of housesAt(i, state.world)) items.push({ kind: "house", z: h.z, ...h });
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) {
    const pr = project(cam, it.x, 0, it.z);
    if (pr.behind || pr.fwd < 4 || pr.fwd > 6000) continue;
    if (it.kind === "tree") drawTree(ctx, pr, it);
    else drawHouse(ctx, pr, it);
  }
}

function drawTree(ctx, pr, t) {
  const h = t.h * pr.s;
  if (h < 2) return;
  const x = pr.sx;
  const base = pr.sy;
  ctx.fillStyle = "#4a3524";
  ctx.fillRect(x - 0.09 * h, base - 0.22 * h, 0.18 * h, 0.22 * h);
  if (t.pine) {
    ctx.fillStyle = "#2e5230";
    for (let k = 0; k < 3; k++) {
      const w = (0.62 - k * 0.16) * h;
      const y0 = base - (0.2 + k * 0.26) * h;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y0);
      ctx.lineTo(x, y0 - 0.34 * h);
      ctx.lineTo(x + w / 2, y0);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#3f6b34";
    ctx.beginPath();
    ctx.arc(x, base - 0.55 * h, 0.3 * h, 0, Math.PI * 2);
    ctx.arc(x - 0.22 * h, base - 0.38 * h, 0.2 * h, 0, Math.PI * 2);
    ctx.arc(x + 0.22 * h, base - 0.38 * h, 0.2 * h, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHouse(ctx, pr, h) {
  const w = h.w * pr.s;
  const hh = h.h * pr.s;
  if (w < 3) return;
  const x = pr.sx;
  const base = pr.sy;
  ctx.fillStyle = "#e8dcc0";
  ctx.fillRect(x - w / 2, base - hh, w, hh);
  ctx.fillStyle = h.roof;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 2, base - hh);
  ctx.lineTo(x, base - hh - 0.55 * hh);
  ctx.lineTo(x + w / 2 + 2, base - hh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#5a4632";
  ctx.fillRect(x - 0.08 * w, base - 0.45 * hh, 0.16 * w, 0.45 * hh);
}

// --- rings & beacon ------------------------------------------------------------
function drawRings(ctx, state) {
  const cam = state.camera;
  const next = state.world.rings.find((r) => !r.passed && !r.missed);
  for (const ring of state.world.rings) {
    const pr = project(cam, ring.x, ring.y, ring.z);
    if (pr.behind || pr.fwd < 4 || pr.fwd > 6500) continue;
    const isNext = ring === next;
    let r = ring.r * pr.s;
    if (r < 2) continue;
    if (isNext) r *= 1 + 0.05 * Math.sin(state.time * 6);
    const alpha = ring.passed
      ? Math.max(0, 1 - (state.time - ring.passedAt) / 1.5)
      : ring.missed
        ? 0.3
        : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (isNext) {
      // Light beam above the next ring so it can be found from far away.
      const beam = ctx.createLinearGradient(0, pr.sy - r * 3.2, 0, pr.sy - r);
      beam.addColorStop(0, "rgba(255, 217, 77, 0)");
      beam.addColorStop(1, "rgba(255, 217, 77, 0.5)");
      ctx.fillStyle = beam;
      ctx.fillRect(pr.sx - r * 0.16, pr.sy - r * 3.2, r * 0.32, r * 2.2);
    }
    ctx.strokeStyle = ring.passed ? PALETTE.ringDone : ring.missed ? "#9a9a9a" : PALETTE.ring;
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = isNext ? 22 : 10;
    ctx.beginPath();
    ctx.ellipse(pr.sx, pr.sy, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.strokeStyle = "rgba(60, 30, 0, 0.55)";
    ctx.beginPath();
    ctx.ellipse(pr.sx, pr.sy, r * 0.82, r * 0.77, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (isNext) {
      ctx.fillStyle = PALETTE.ringNext;
      ctx.font = `700 ${Math.max(11, r * 0.24)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("NEXT", pr.sx, pr.sy - r * 1.35);
    }
    ctx.restore();
  }
}

function drawBeacon(ctx, state) {
  const b = state.world.beacon;
  if (!b) return;
  const cam = state.camera;
  const pr = project(cam, b.x, 0, b.z);
  if (pr.behind || pr.fwd < 4 || pr.fwd > 6500) return;
  const h = 260 * pr.s;
  const beam = ctx.createLinearGradient(0, pr.sy - h, 0, pr.sy);
  beam.addColorStop(0, "rgba(255, 120, 90, 0)");
  beam.addColorStop(1, "rgba(255, 120, 90, 0.55)");
  ctx.fillStyle = beam;
  ctx.fillRect(pr.sx - 3 * pr.s, pr.sy - h, 6 * pr.s, h);
  ctx.fillStyle = "#ff6a4d";
  ctx.shadowColor = "#ff6a4d";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(pr.sx, pr.sy - 8 * pr.s, 5 * pr.s, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BEACON", pr.sx, pr.sy - h - 8);
}

// --- the plane -----------------------------------------------------------------
function drawPlaneShadow(ctx, state) {
  const p = state.plane;
  if (p.y > 90 || p.onGround) return;
  const pr = project(state.camera, p.x, 0.2, p.z);
  if (pr.behind) return;
  // Capped: the plane sits only 16 m ahead of the camera, so the raw
  // projection explodes. A small soft ellipse reads as a shadow.
  const w = Math.min(150, 90 * pr.s) * (1 - p.y / 120);
  if (w < 4) return;
  ctx.fillStyle = `rgba(20, 20, 10, ${0.28 * (1 - p.y / 90)})`;
  ctx.beginPath();
  ctx.ellipse(pr.sx, pr.sy, w, Math.max(2, w * 0.22), 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlane(ctx, state) {
  const p = state.plane;
  const px = W / 2 - p.bank * 46;
  const py = H * 0.66 + p.vs * 1.2;
  const S = 1.05; // overall plane scale
  const blink = Math.sin(state.time * 6) > 0;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.bank * 0.95);
  ctx.scale(S, S);

  // Chase view: the nose points away (up-screen, small), the tail is
  // closest to the camera (down-screen, big). Foreshortened on purpose.
  // Main wing, mid-body, slight dihedral.
  ctx.fillStyle = PALETTE.planeCream;
  ctx.beginPath();
  ctx.moveTo(-14, -6);
  ctx.lineTo(-90, -18);
  ctx.lineTo(-94, -9);
  ctx.lineTo(-14, 4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -6);
  ctx.lineTo(90, -18);
  ctx.lineTo(94, -9);
  ctx.lineTo(14, 4);
  ctx.closePath();
  ctx.fill();
  // Red wingtips + nav lights.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.fillRect(-94, -14, 8, 7);
  ctx.fillRect(86, -14, 8, 7);
  if (blink) {
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath();
    ctx.arc(-94, -10, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#37e08a";
    ctx.beginPath();
    ctx.arc(94, -10, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fuselage: narrow at the nose (far), wide at the tail (near).
  ctx.fillStyle = PALETTE.planeCream;
  ctx.beginPath();
  ctx.moveTo(-11, -28);
  ctx.quadraticCurveTo(0, -34, 11, -28);
  ctx.lineTo(17, 18);
  ctx.quadraticCurveTo(0, 26, -17, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.planeRed;
  ctx.fillRect(-14, -2, 28, 4);
  // Tailplane, at the tail end.
  ctx.fillStyle = PALETTE.planeCream;
  ctx.beginPath();
  ctx.moveTo(-14, 12);
  ctx.lineTo(-56, 4);
  ctx.lineTo(-56, 12);
  ctx.lineTo(-14, 20);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 12);
  ctx.lineTo(56, 4);
  ctx.lineTo(56, 12);
  ctx.lineTo(14, 20);
  ctx.closePath();
  ctx.fill();
  // Vertical fin, pointing down-screen: it is the closest part of the plane.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-7, 16);
  ctx.lineTo(0, 42);
  ctx.lineTo(7, 16);
  ctx.closePath();
  ctx.fill();
  // Cockpit windows, near the nose.
  ctx.fillStyle = "#20303e";
  ctx.beginPath();
  ctx.moveTo(-8, -26);
  ctx.lineTo(-5, -16);
  ctx.lineTo(5, -16);
  ctx.lineTo(8, -26);
  ctx.closePath();
  ctx.fill();
  // Prop disc at the nose (far end).
  ctx.fillStyle = "rgba(200, 210, 220, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, -31, 3.5, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Landing gear under the wings when low.
  if (p.onGround || p.y < 8) {
    ctx.strokeStyle = PALETTE.planeDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.lineTo(-14, 18);
    ctx.moveTo(10, 2);
    ctx.lineTo(14, 18);
    ctx.stroke();
    ctx.fillStyle = "#1c1c1c";
    ctx.beginPath();
    ctx.arc(-15, 20, 4.5, 0, Math.PI * 2);
    ctx.arc(15, 20, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- HUD -----------------------------------------------------------------------
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHUD(ctx, state) {
  const p = state.plane;
  const m = state.mission;
  const kt = Math.round(p.speed * 1.944);
  const altFt = Math.round(p.y * 3.281);
  const vsFpm = Math.round(p.vs * 196.85);
  const hdgDeg = Math.round(((p.heading * 180) / Math.PI + 360) % 360);

  // Airspeed + throttle, top-left.
  panel(ctx, 18, 16, 210, 92);
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText("AIRSPEED  kt", 30, 36);
  ctx.font = "700 34px 'SF Mono', Consolas, monospace";
  ctx.fillText(String(kt), 30, 72);
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = PALETTE.hudMuted || "#b9b2a2";
  ctx.fillText("THR", 30, 96);
  ctx.fillStyle = "#2a3348";
  ctx.fillRect(64, 86, 148, 10);
  ctx.fillStyle = p.throttle > 0.85 ? PALETTE.hudAmber : PALETTE.hudCyan;
  ctx.fillRect(64, 86, 148 * p.throttle, 10);

  // Compass strip, top-centre.
  panel(ctx, W / 2 - 190, 16, 380, 56);
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - 190, 16, 380, 56);
  ctx.clip();
  ctx.textAlign = "center";
  for (let d = -60; d <= 60; d += 15) {
    const deg = Math.round(((hdgDeg + d) / 15)) * 15;
    const norm = ((deg % 360) + 360) % 360;
    const x = W / 2 + d * 2.6;
    ctx.fillStyle = d === 0 ? PALETTE.hudAmber : PALETTE.hudText;
    ctx.font = d % 45 === 0 ? "700 13px system-ui, sans-serif" : "400 11px system-ui, sans-serif";
    const label = d % 45 === 0 ? points[norm / 45] : String(norm);
    ctx.fillText(label, x, norm % 45 === 0 ? 40 : 52);
    ctx.fillRect(x - 0.5, 56, 1, d % 45 === 0 ? 8 : 5);
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 6, 16);
  ctx.lineTo(W / 2 + 6, 16);
  ctx.lineTo(W / 2, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${String(hdgDeg).padStart(3, "0")}°`, W / 2, 68);

  // Altitude + vertical speed, top-right.
  panel(ctx, W - 228, 16, 210, 92);
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText("ALTITUDE  ft", W - 216, 36);
  ctx.font = "700 34px 'SF Mono', Consolas, monospace";
  ctx.fillText(String(altFt), W - 216, 72);
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = vsFpm >= 0 ? PALETTE.hudGreen : PALETTE.hudAmber;
  ctx.fillText(`VS ${vsFpm >= 0 ? "+" : ""}${vsFpm} fpm`, W - 216, 96);

  // Objective + score, under the compass.
  ctx.textAlign = "center";
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText(objectiveText(state), W / 2, 100);
  ctx.font = "700 15px 'SF Mono', Consolas, monospace";
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(`SCORE ${m.score}`, W / 2, 122);

  // Fuel + damage, bottom-left.
  panel(ctx, 18, H - 92, 240, 76);
  ctx.textAlign = "left";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = p.fuel < 20 ? PALETTE.hudRed : PALETTE.hudText;
  ctx.fillText(`FUEL ${Math.round(p.fuel)}%`, 30, H - 70);
  ctx.fillStyle = "#2a3348";
  ctx.fillRect(30, H - 60, 216, 12);
  ctx.fillStyle = p.fuel < 20 ? PALETTE.hudRed : p.fuel < 45 ? PALETTE.hudAmber : PALETTE.hudGreen;
  ctx.fillRect(30, H - 60, 216 * (p.fuel / 100), 12);
  if (p.damage > 0) {
    ctx.fillStyle = PALETTE.hudRed;
    ctx.fillText(`DAMAGE ${Math.round(p.damage)}%`, 30, H - 30);
    ctx.fillStyle = "#2a3348";
    ctx.fillRect(30, H - 26, 216, 8);
    ctx.fillStyle = PALETTE.hudRed;
    ctx.fillRect(30, H - 26, 216 * (p.damage / 100), 8);
  } else {
    ctx.fillStyle = "#b9b2a2";
    ctx.fillText("AIRFRAME OK", 30, H - 30);
  }

  // Attitude indicator, bottom-right.
  drawAttitude(ctx, state, W - 72, H - 64, 46);

  // Next-target arrow when the target is off-screen.
  drawTargetArrow(ctx, state);

  // Warnings.
  if (p.stalled && state.mode === "playing") {
    ctx.textAlign = "center";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillStyle = Math.sin(state.time * 10) > 0 ? PALETTE.hudRed : "#ffffff";
    ctx.fillText("STALL — NOSE DOWN, ADD POWER", W / 2, 168);
  }
  if (p.fuel > 0 && p.fuel < 15 && state.mode === "playing") {
    ctx.textAlign = "center";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillStyle = Math.sin(state.time * 8) > 0 ? PALETTE.hudAmber : PALETTE.hudText;
    ctx.fillText("LOW FUEL", W / 2, 192);
  }

  // Centre message banner.
  if (state.message && state.time < state.message.until) {
    const alpha = Math.min(1, (state.message.until - state.time) / 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText(state.message.text, W / 2, H * 0.3);
    ctx.restore();
  }

  // Bottom hint line.
  ctx.textAlign = "center";
  ctx.font = "400 12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(242, 237, 224, 0.75)";
  ctx.fillText("W/S throttle · ←/→ bank · ↑/↓ pitch · P pause · M sound", W / 2, H - 12);
}

function drawAttitude(ctx, state, cx, cy, r) {
  const p = state.plane;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-p.bank);
  ctx.translate(0, clamp(p.vs, -9, 9) * 2.4);
  ctx.fillStyle = "#3f6ea6";
  ctx.fillRect(-r, -r * 2, r * 2, r * 2);
  ctx.fillStyle = "#7a5a34";
  ctx.fillRect(-r, 0, r * 2, r * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-r, -1, r * 2, 2);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.hudText;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillRect(cx - 16, cy - 1.5, 12, 3);
  ctx.fillRect(cx + 4, cy - 1.5, 12, 3);
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTargetArrow(ctx, state) {
  const t = nextTarget(state);
  if (!t || state.mode !== "playing") return;
  const pr = project(state.camera, t.x, t.y, t.z);
  if (pr && !pr.behind && pr.sx > 60 && pr.sx < W - 60 && pr.sy > 130 && pr.sy < H - 140) return; // on screen
  // Behind the camera: point the arrow down, i.e. turn around.
  const tx = pr && !pr.behind ? pr.sx : W / 2;
  const ty = pr && !pr.behind ? pr.sy : H + 100;
  const cx = W / 2;
  const cy = H * 0.42;
  const ang = Math.atan2(ty - cy, tx - cx);
  const ax = cx + Math.cos(ang) * 210;
  const ay = cy + Math.sin(ang) * 150;
  const dist = Math.max(0, Math.round(t.z - state.plane.z));
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText(`${dist} m`, ax, ay + 26);
}

// --- overlays ------------------------------------------------------------------
function drawTitle(ctx, state) {
  const input = state.input;
  ctx.fillStyle = "rgba(10, 14, 24, 0.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f2ede0";
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.fillText("KESTREL RUN", W / 2, 128);
  ctx.font = "400 20px system-ui, sans-serif";
  ctx.fillStyle = "#ffd9a0";
  ctx.fillText("A bush-plane courier game — golden hour over the valley", W / 2, 162);
  ctx.font = "400 15px system-ui, sans-serif";
  ctx.fillStyle = "#b9b2a2";
  ctx.fillText("Fly the rings, land the strips, beat the clock. One tank of fuel at a time.", W / 2, 188);

  const cards = [
    { id: "ring-run", x: 170, y: 240 },
    { id: "island-hop", x: 500, y: 240 },
    { id: "courier-dash", x: 830, y: 240 },
  ];
  const hotspots = [];
  const hovered = input.hoveredHotspot();
  for (const card of cards) {
    const def = state.missions[card.id];
    const sel = state.missionId === card.id;
    const hov = hovered === `mission:${card.id}`;
    ctx.fillStyle = sel ? "rgba(255, 191, 71, 0.22)" : hov ? "rgba(255, 255, 255, 0.10)" : "rgba(16, 22, 34, 0.72)";
    roundRect(ctx, card.x, card.y, 280, 190, 12);
    ctx.fill();
    ctx.strokeStyle = sel ? PALETTE.hudAmber : "rgba(242, 237, 224, 0.35)";
    ctx.lineWidth = sel ? 2.5 : 1;
    roundRect(ctx, card.x, card.y, 280, 190, 12);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(def.short, card.x + 140, card.y + 44);
    ctx.fillStyle = "#f2ede0";
    ctx.font = "400 14px/1.5 system-ui, sans-serif";
    wrapText(ctx, def.tagline, card.x + 140, card.y + 76, 248, 20);
    ctx.fillStyle = "#b9b2a2";
    ctx.font = "400 13px system-ui, sans-serif";
    ctx.fillText(def.detail, card.x + 140, card.y + 168);
    hotspots.push({ id: `mission:${card.id}`, x: card.x, y: card.y, w: 280, h: 190 });
  }
  input.hotspots = hotspots;

  // Instruction lines sit below the parked plane (cards end at y 430,
  // the plane spans roughly y 431..519), so the aircraft stays visible.
  ctx.fillStyle = "#f2ede0";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText("CLICK A MISSION — OR PRESS 1 / 2 / 3 — THEN ENTER TO FLY", W / 2, 565);
  ctx.font = "400 14px system-ui, sans-serif";
  ctx.fillStyle = "#b9b2a2";
  ctx.fillText("W/S or Shift/Ctrl — throttle · ←/→ or A/D — bank · ↑/↓ — climb / descend", W / 2, 595);
  ctx.fillText("P — pause · M — sound · R — restart · Land slow and level on a runway to refuel", W / 2, 619);
  ctx.fillStyle = "rgba(185, 178, 162, 0.7)";
  ctx.font = "400 12px system-ui, sans-serif";
  ctx.fillText(`seed ${state.world.seed} · no downloads, no accounts, no network — just you and the valley`, W / 2, 690);
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, cx, yy);
}

function drawCenterCard(ctx, title, sub) {
  ctx.fillStyle = "rgba(10, 14, 24, 0.6)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f2ede0";
  ctx.font = "700 44px system-ui, sans-serif";
  ctx.fillText(title, W / 2, H / 2 - 10);
  ctx.font = "400 16px system-ui, sans-serif";
  ctx.fillStyle = "#b9b2a2";
  ctx.fillText(sub, W / 2, H / 2 + 28);
}

function drawEndCard(ctx, state, title, won) {
  const m = state.mission;
  ctx.fillStyle = "rgba(10, 14, 24, 0.62)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = won ? PALETTE.hudAmber : PALETTE.hudRed;
  ctx.font = "700 46px system-ui, sans-serif";
  ctx.fillText(title, W / 2, 190);
  ctx.fillStyle = "#f2ede0";
  ctx.font = "400 18px system-ui, sans-serif";
  ctx.fillText(m.endReason || "", W / 2, 226);
  ctx.font = "700 30px 'SF Mono', Consolas, monospace";
  ctx.fillText(`SCORE ${m.score}`, W / 2, 282);
  ctx.font = "400 16px system-ui, sans-serif";
  ctx.fillStyle = "#b9b2a2";
  const lines = [
    `Mission: ${m.def.name} · Time ${fmtClock(m.elapsed)} · Fuel left ${Math.round(state.plane.fuel)}%`,
  ];
  if (m.id === "ring-run") lines.push(`Rings ${m.ringsPassed}/${m.ringsTotal}`);
  if (m.id === "island-hop") lines.push(`Landings ${m.landings}/${m.landingsRequired}`);
  if (m.completeBreakdown) {
    lines.push(
      `Finish +${m.completeBreakdown.complete} · Fuel bonus +${m.completeBreakdown.fuel} · Time bonus +${m.completeBreakdown.time}`,
    );
  }
  let yy = 322;
  for (const ln of lines) {
    ctx.fillText(ln, W / 2, yy);
    yy += 28;
  }
  ctx.fillStyle = "#f2ede0";
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillText("R — FLY AGAIN · 1 / 2 / 3 — ANOTHER MISSION · CLICK A CARD BELOW", W / 2, yy + 26);

  // Mission cards sit near the bottom, clear of the parked plane.
  const cards = [
    { id: "ring-run", x: 320, y: H - 96 },
    { id: "island-hop", x: 500, y: H - 96 },
    { id: "courier-dash", x: 680, y: H - 96 },
  ];
  const hotspots = [];
  for (const card of cards) {
    const def = state.missions[card.id];
    ctx.fillStyle = "rgba(16, 22, 34, 0.8)";
    roundRect(ctx, card.x, card.y, 280, 46, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(242, 237, 224, 0.35)";
    ctx.lineWidth = 1;
    roundRect(ctx, card.x, card.y, 280, 46, 8);
    ctx.stroke();
    ctx.fillStyle = "#f2ede0";
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.fillText(def.short, card.x + 140, card.y + 29);
    hotspots.push({ id: `mission:${card.id}`, x: card.x, y: card.y, w: 280, h: 46 });
  }
  state.input.hotspots = hotspots;
}

function drawLandedHint(ctx, state) {
  ctx.textAlign = "center";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText("ON THE GROUND — THROTTLE UP AND PULL UP TO GO AROUND", W / 2, H * 0.3);
  ctx.shadowBlur = 0;
}
