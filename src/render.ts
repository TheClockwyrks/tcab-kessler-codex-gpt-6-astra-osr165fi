import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import { RAD, polar, span, type State } from "./simulation";
import { debug } from "./debug";
export const BACKGROUND = "#080f19";
const INK = "#e5eee9",
  MUTED = "#81969e",
  TEAL = "#8edbc7",
  GOLD = "#dbb88a";
const ringColors = ["#74bcae", "#849fb9", "#c9ae86"];
const players = new WeakMap<
  CanvasRenderingContext2D,
  Map<number, { player: ParticleCanvasPlayer; age: number }>
>();
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  align: CanvasTextAlign = "left",
  weight = 400,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${size > 45 ? "Arial, sans-serif" : "monospace"}`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function arc(
  ctx: CanvasRenderingContext2D,
  r: number,
  start = 0,
  end = 360,
): void {
  ctx.beginPath();
  ctx.arc(C.STAGE_CX, C.STAGE_CY, r, start * RAD, end * RAD);
}
function sector(
  ctx: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  start: number,
  end: number,
): void {
  ctx.beginPath();
  ctx.arc(C.STAGE_CX, C.STAGE_CY, outer, start * RAD, end * RAD);
  ctx.arc(C.STAGE_CX, C.STAGE_CY, inner, end * RAD, start * RAD, true);
  ctx.closePath();
}
function stars(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(470, 420, 30, 500, 500, 650);
  g.addColorStop(0, "#102530");
  g.addColorStop(0.65, "#0a1521");
  g.addColorStop(1, BACKGROUND);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  for (let i = 0; i < 220; i++) {
    const x = (Math.sin(i * 127.1 + 8) * 43758.5453) % 1,
      y = (Math.sin(i * 311.7 + 3) * 19341.19) % 1;
    ctx.fillStyle = i % 7 === 0 ? "#7e9caa" : "#304754";
    ctx.beginPath();
    ctx.arc(
      Math.abs(x) * C.STAGE_W,
      Math.abs(y) * C.STAGE_H,
      i % 7 === 0 ? 1.1 : 0.65,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
function field(s: State, ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "#28464f";
  ctx.lineWidth = 1;
  arc(ctx, C.FIELD_RADIUS);
  ctx.stroke();
  for (let i = 0; i < 120; i++) {
    const a = i * 3;
    const p = polar(C.FIELD_RADIUS + (i % 5 === 0 ? 7 : 3), a),
      q = polar(C.FIELD_RADIUS, a);
    ctx.strokeStyle = i % 5 === 0 ? "#4b6c75" : "#233b46";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  for (const r of [C.DEFLECTOR_TRACK_INNER, C.DEFLECTOR_TRACK_OUTER]) {
    ctx.strokeStyle = "#25414b";
    arc(ctx, r);
    ctx.stroke();
  }
  ctx.setLineDash([2, 9]);
  ctx.strokeStyle = "#233c47";
  arc(ctx, 245);
  ctx.stroke();
  ctx.setLineDash([]);
  s.rings.forEach((ring, i) => {
    const cfg = C.RINGS[i];
    ctx.strokeStyle = "#1a303c";
    arc(ctx, cfg.midRadius);
    ctx.stroke();
    ring.targets.forEach((t) => {
      const start =
          ring.angleDeg + t.slot * cfg.slotWidthDeg + C.STRUCTURAL_GAP_DEG,
        end = start + cfg.targetArcDeg;
      const damaged = t.hp < cfg.hitPoints;
      sector(ctx, cfg.innerRadius, cfg.outerRadius, start, end);
      ctx.fillStyle = damaged
        ? "#263344"
        : ["#234b4d", "#293e53", "#49433a"][i];
      ctx.fill();
      ctx.strokeStyle = damaged ? "#647686" : ringColors[i];
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = damaged ? "#b78070" : ringColors[i];
      ctx.lineWidth = 2.5;
      arc(ctx, cfg.innerRadius + 3, start + 0.7, end - 0.7);
      ctx.stroke();
      const mid = (start + end) / 2;
      for (const delta of [-0.32, 0, 0.32]) {
        const a = mid + cfg.targetArcDeg * delta,
          p = polar(cfg.innerRadius + 7, a),
          q = polar(cfg.outerRadius - 5, a);
        ctx.strokeStyle = damaged ? "#59707a" : "#728b91";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      const p = polar(cfg.midRadius, mid);
      ctx.fillStyle = damaged ? "#e39277" : INK;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      if (damaged) {
        const a = polar(cfg.innerRadius, start + 3),
          b = polar(cfg.outerRadius, mid);
        ctx.strokeStyle = "#101b28";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
  });
  ctx.drawImage(
    s.assets.planet,
    C.STAGE_CX - C.PLANET_SPRITE_SIZE / 2,
    C.STAGE_CY - C.PLANET_SPRITE_SIZE / 2,
  );
  if (s.effects.shieldActive) {
    ctx.strokeStyle = "#87baff";
    ctx.shadowColor = "#669dff";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    arc(ctx, C.SHIELD_RADIUS);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  const a = s.paddle.angleDeg,
    half = span(s) / 2;
  sector(
    ctx,
    C.DEFLECTOR_TRACK_INNER,
    C.DEFLECTOR_TRACK_OUTER,
    a - half,
    a + half,
  );
  ctx.fillStyle = "#b9e4d8";
  ctx.shadowColor = TEAL;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#edfff4";
  ctx.lineWidth = 2;
  arc(ctx, C.DEFLECTOR_TRACK_OUTER, a - half, a + half);
  ctx.stroke();
  for (let d = -half + 5; d < half; d += 5) {
    const p = polar(C.DEFLECTOR_TRACK_INNER + 3, a + d),
      q = polar(C.DEFLECTOR_TRACK_OUTER - 4, a + d);
    ctx.strokeStyle = "#4b8785";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  s.balls.forEach((b) => {
    if (!b.parked) {
      const v = Math.hypot(b.vx, b.vy) || 1;
      const trail = ctx.createLinearGradient(
        b.x,
        b.y,
        b.x - (b.vx / v) * 27,
        b.y - (b.vy / v) * 27,
      );
      trail.addColorStop(0, s.effects.pierceTicks ? "#cfa9ff99" : "#a1efda88");
      trail.addColorStop(1, "#a1efda00");
      ctx.strokeStyle = trail;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / v) * 27, b.y - (b.vy / v) * 27);
      ctx.stroke();
    }
    ctx.drawImage(
      s.assets.balls[
        Math.floor((s.simTicks - b.born) / C.BALL_FRAME_TICKS) %
          C.BALL_SPIN_FRAMES
      ],
      b.x - C.BALL_SPRITE_SIZE / 2,
      b.y - C.BALL_SPRITE_SIZE / 2,
    );
  });
  s.pods.forEach((p) =>
    ctx.drawImage(
      s.assets.pods[p.kind],
      p.x - C.POD_SPRITE_SIZE / 2,
      p.y - C.POD_SPRITE_SIZE / 2,
    ),
  );
  if (s.balls.some((b) => b.parked) && s.screen === "playing") {
    text(ctx, "SPACE / LAUNCH", 500, 606, 12, TEAL, "center");
  }
}
function effects(s: State, ctx: CanvasRenderingContext2D): void {
  let cache = players.get(ctx);
  if (!cache) {
    cache = new Map();
    players.set(ctx, cache);
  }
  const alive = new Set(s.events.map((e) => e.seed));
  for (const key of cache.keys()) if (!alive.has(key)) cache.delete(key);
  for (const e of s.events) {
    ctx.save();
    ctx.translate(e.x, e.y - 128);
    ctx.scale(128 / ctx.canvas.width, 128 / ctx.canvas.height);
    let item = cache.get(e.seed);
    if (!item) {
      item = {
        player: new ParticleCanvasPlayer(
          s.assets.particles[e.kind] as ParticleSystem,
          ctx,
          { clear: false, seed: e.seed, pixelRadius: 3 },
        ),
        age: 0,
      };
      cache.set(e.seed, item);
    }
    item.player.update(Math.max(0, e.age - item.age));
    item.age = e.age;
    ctx.restore();
  }
}
function hud(s: State, ctx: CanvasRenderingContext2D): void {
  text(ctx, "SALVAGE / SCORE", 30, 35, 12, MUTED);
  text(ctx, String(s.score).padStart(7, "0"), 30, 65, 27, INK);
  text(ctx, "WAVE", 970, 35, 12, MUTED, "right");
  text(ctx, String(s.wave).padStart(2, "0"), 970, 65, 27, GOLD, "right");
  text(ctx, "HULL / " + String(s.lives).padStart(2, "0"), 30, 950, 15, TEAL);
  text(ctx, "A D / ORBIT", 30, 978, 11, MUTED);
  text(ctx, "P / PAUSE", 970, 978, 11, MUTED, "right");
  let y = 905;
  for (const kind of C.POD_KINDS) {
    const active =
      kind === "shield"
        ? s.effects.shieldActive
        : kind === "multiball"
          ? false
          : s.effects[`${kind}Ticks`] > 0;
    if (active) {
      ctx.drawImage(s.assets.pods[kind], 950, y - 16);
      text(ctx, kind.toUpperCase(), 940, y, 12, INK, "right");
      y -= 30;
    }
  }
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "#09131eee";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#38565f";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = TEAL;
  ctx.fillRect(x, y, 42, 3);
  ctx.fillRect(x + w - 42, y + h - 3, 42, 3);
}
function menu(s: State, ctx: CanvasRenderingContext2D): void {
  const items = s.screen === "title" ? C.TITLE_ITEMS : C.PAUSE_ITEMS;
  items.forEach((item, i) => {
    const rect = debug.menuItemRect(s, i)!;
    const selected = s.menu.index === i;
    ctx.fillStyle = selected ? "#b9dfd0" : "#10232e";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = selected ? TEAL : "#35515b";
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    text(
      ctx,
      item,
      500,
      rect.y + 35,
      18,
      selected ? "#0b242a" : MUTED,
      "center",
      700,
    );
    if (selected) text(ctx, "›", rect.x + 22, rect.y + 35, 22, "#0b242a");
  });
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  stars(ctx);
  field(s, ctx);
  effects(s, ctx);
  if (["playing", "paused", "waveclear"].includes(s.screen)) hud(s, ctx);
  if (s.screen === "title") {
    ctx.fillStyle = "#080f197a";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    panel(ctx, 245, 245, 510, 545);
    text(
      ctx,
      "O R B I T A L   D E M O L I T I O N",
      500,
      295,
      12,
      TEAL,
      "center",
    );
    text(ctx, C.TITLE_TEXT, 500, 393, 86, INK, "center", 700);
    text(ctx, "CLEAR THE SKY. KEEP IT THAT WAY.", 500, 427, 13, GOLD, "center");
    ctx.drawImage(s.assets.planet, 420, 444);
    menu(s, ctx);
    text(ctx, "01 / LOW ORBIT CLEANUP DIVISION", 500, 834, 11, MUTED, "center");
    text(ctx, "↑ ↓  SELECT     ENTER  CONFIRM", 500, 864, 12, MUTED, "center");
  } else if (s.screen === "howto") {
    ctx.fillStyle = "#080f19bb";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    panel(ctx, 190, 160, 620, 680);
    text(ctx, "FLIGHT MANUAL / 01", 235, 211, 13, TEAL);
    text(ctx, "HOW TO PLAY", 235, 270, 42, INK, "left", 700);
    const lines = [
      ["01 / DEFEND", "Circle the planet. Bat the ball into the derelicts."],
      ["02 / DEMOLISH", "Every hit scores. Clear the sky to advance a wave."],
      ["03 / RECOVER", "Catch falling salvage with your deflector."],
      ["04 / SURVIVE", "Balls burn at the planet. Lose the last: lose a life."],
    ];
    lines.forEach(([title, body], i) => {
      text(ctx, title, 235, 325 + i * 65, 13, GOLD);
      text(ctx, body, 235, 349 + i * 65, 14, INK);
    });
    C.POD_KINDS.forEach((kind, i) => {
      const x = 253 + i * 123;
      ctx.drawImage(s.assets.pods[kind], x, 586);
      text(ctx, kind.toUpperCase(), x + 12, 631, 11, MUTED, "center");
    });
    text(ctx, "← → / A D  ORBIT     SPACE  LAUNCH", 235, 689, 15, TEAL);
    text(ctx, "P / ESC  PAUSE     ↑ ↓ / W S  MENU", 235, 720, 15, TEAL);
    text(ctx, "ENTER / SPACE  CONFIRM     ESC  BACK", 235, 751, 15, TEAL);
    text(ctx, "PRESS ENTER TO RETURN", 500, 801, 12, MUTED, "center");
  } else if (s.screen === "paused") {
    ctx.fillStyle = "#080f1988";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    panel(ctx, 275, 345, 450, 345);
    text(ctx, "FLIGHT SUSPENDED", 500, 397, 12, TEAL, "center");
    text(ctx, "PAUSED", 500, 466, 55, INK, "center", 700);
    menu(s, ctx);
  } else if (s.screen === "waveclear") {
    panel(ctx, 220, 390, 560, 185);
    text(ctx, "ORBIT SECURED", 500, 446, 40, INK, "center", 700);
    text(
      ctx,
      `WAVE ${s.wave} CLEAR  /  +${C.WAVE_CLEAR_BONUS_PER_WAVE * s.wave}`,
      500,
      492,
      18,
      TEAL,
      "center",
    );
    text(ctx, "ACQUIRING NEXT DEBRIS FIELD", 500, 537, 12, MUTED, "center");
  } else if (s.screen === "gameover") {
    ctx.fillStyle = "#080f19c9";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    panel(ctx, 230, 310, 540, 385);
    text(ctx, "SIGNAL LOST / MISSION REPORT", 500, 361, 12, GOLD, "center");
    text(ctx, C.GAMEOVER_TEXT, 500, 435, 58, INK, "center", 700);
    text(ctx, String(s.score).padStart(7, "0"), 500, 513, 42, TEAL, "center");
    text(ctx, `FINAL SCORE     WAVE ${s.wave}`, 500, 552, 14, MUTED, "center");
    text(ctx, "ENTER / RETURN TO BASE", 500, 639, 14, INK, "center");
  }
  ctx.restore();
}
