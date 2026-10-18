import * as C from "./constants";
import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  parked: boolean;
  born: number;
}
export interface Ring {
  angleDeg: number;
  speedDegPerSec: number;
  targets: { slot: number; hp: number }[];
}
export interface Pod {
  kind: C.PodKind;
  x: number;
  y: number;
}
export interface EffectEvent {
  kind: "burst" | "spark" | "burnup";
  x: number;
  y: number;
  age: number;
  seed: number;
}
export interface Assets {
  planet: ImageBitmap;
  balls: ImageBitmap[];
  pods: Record<C.PodKind, ImageBitmap>;
  particles: Record<EffectEvent["kind"], ParticleSystem>;
}
export interface KesslerState {
  screen: C.Screen;
  ticks: number;
  simTicks: number;
  accumulator: number;
  wave: number;
  score: number;
  lives: number;
  interstitialTicks: number;
  waveAdvance: boolean;
  podSpawn: boolean;
  nextPod: C.PodKind | "none" | null;
  paddle: { angleDeg: number };
  balls: Ball[];
  rings: Ring[];
  pods: Pod[];
  effects: {
    widenTicks: number;
    narrowTicks: number;
    pierceTicks: number;
    shieldActive: boolean;
  };
  menu: { index: number };
  pointerPress: { id: number; index: number } | null;
  events: EffectEvent[];
  assets: Assets;
}
export type State = DeepReadonly<KesslerState>;
export const RAD = Math.PI / 180;
export const norm = (a: number) => ((a % 360) + 360) % 360;
export const offset = (a: number, b: number) => norm(a - b + 180) - 180;
export const polar = (r: number, a: number) => ({
  x: C.STAGE_CX + r * Math.cos(a * RAD),
  y: C.STAGE_CY + r * Math.sin(a * RAD),
});
export const radius = (p: { readonly x: number; readonly y: number }) =>
  Math.hypot(p.x - C.STAGE_CX, p.y - C.STAGE_CY);
export const angle = (p: { readonly x: number; readonly y: number }) =>
  norm(Math.atan2(p.y - C.STAGE_CY, p.x - C.STAGE_CX) / RAD);
export const speed = (w: number) =>
  Math.min(
    C.BALL_SPEED_BASE + C.BALL_SPEED_PER_WAVE * (w - 1),
    C.BALL_SPEED_CAP,
  );
export const orbit = (i: number, w: number) => {
  const r = C.RINGS[i];
  return (
    r.orbitSign *
    Math.min(
      r.orbitBaseDegPerSec + r.orbitPerWaveDegPerSec * (w - 1),
      r.orbitCapDegPerSec,
    )
  );
};
export const span = (s: State) =>
  s.effects.widenTicks > 0
    ? C.WIDEN_SPAN_DEG
    : s.effects.narrowTicks > 0
      ? C.NARROW_SPAN_DEG
      : C.DEFLECTOR_BASE_SPAN_DEG;
export const rings = (w: number): Ring[] =>
  C.RINGS.map((r, i) => ({
    angleDeg: 0,
    speedDegPerSec: orbit(i, w),
    targets: Array.from({ length: r.slots }, (_, slot) => ({
      slot,
      hp: r.hitPoints,
    })),
  }));
export function fresh(assets: Assets): KesslerState {
  return {
    screen: "title",
    ticks: 0,
    simTicks: 0,
    accumulator: 0,
    wave: C.START_WAVE,
    score: 0,
    lives: C.START_LIVES,
    interstitialTicks: 0,
    waveAdvance: true,
    podSpawn: true,
    nextPod: null,
    paddle: { angleDeg: C.DEFLECTOR_START_ANGLE_DEG },
    balls: [],
    rings: rings(C.START_WAVE),
    pods: [],
    effects: {
      widenTicks: 0,
      narrowTicks: 0,
      pierceTicks: 0,
      shieldActive: false,
    },
    menu: { index: 0 },
    pointerPress: null,
    events: [],
    assets,
  };
}
/** Copy only mutable simulation records. Asset handles are immutable resources. */
export function copy(s: State): KesslerState {
  return {
    ...s,
    paddle: { ...s.paddle },
    menu: { ...s.menu },
    effects: { ...s.effects },
    balls: s.balls.map((b) => ({ ...b })),
    rings: s.rings.map((r) => ({
      ...r,
      targets: r.targets.map((t) => ({ ...t })),
    })),
    pods: s.pods.map((p) => ({ ...p })),
    events: s.events.map((e) => ({ ...e })),
    pointerPress: s.pointerPress ? { ...s.pointerPress } : null,
    assets: s.assets as Assets,
  };
}
export function park(s: KesslerState): void {
  s.balls.push({
    ...polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddle.angleDeg),
    vx: 0,
    vy: 0,
    parked: true,
    born: s.simTicks,
  });
}
export function launch(s: KesslerState): void {
  const b = s.balls.find((b) => b.parked);
  if (!b) throw new Error("No parked ball");
  b.parked = false;
  b.vx = speed(s.wave) * Math.cos(s.paddle.angleDeg * RAD);
  b.vy = speed(s.wave) * Math.sin(s.paddle.angleDeg * RAD);
}
export function resetEffects(s: KesslerState): void {
  s.effects = {
    widenTicks: 0,
    narrowTicks: 0,
    pierceTicks: 0,
    shieldActive: false,
  };
  s.pods = [];
}
export function setEffect(
  s: KesslerState,
  kind: "widen" | "narrow" | "pierce",
  ticks: number,
): void {
  s.effects[`${kind}Ticks`] = ticks;
  if (ticks > 0 && kind !== "pierce")
    s.effects[kind === "widen" ? "narrowTicks" : "widenTicks"] = 0;
}
export function drawPod(): C.PodKind | null {
  if (Math.random() >= C.POD_DROP_CHANCE) return null;
  let n = Math.random();
  for (const entry of C.POD_KIND_TABLE) {
    n -= entry.probability;
    if (n < 0) return entry.kind;
  }
  return C.POD_KIND_TABLE[C.POD_KIND_TABLE.length - 1].kind;
}
export function event(
  s: KesslerState,
  kind: EffectEvent["kind"],
  p: { x: number; y: number },
): void {
  s.events.push({
    kind,
    x: p.x,
    y: p.y,
    age: 0,
    seed: Math.floor(Math.random() * 2147483647),
  });
}
/** Velocity-only contact response; position remains at the integrated point. */
export function reflect(
  b: Ball,
  edge: boolean,
  kick: number,
  paddleOffset?: number,
  wave = 1,
): void {
  const a = angle(b) * RAD;
  const nx = Math.cos(a),
    ny = Math.sin(a);
  const tx = -ny,
    ty = nx;
  const incoming = Math.hypot(b.vx, b.vy);
  const dx = edge ? tx : nx,
    dy = edge ? ty : ny;
  const dot = b.vx * dx + b.vy * dy;
  let vx = b.vx - 2 * dot * dx,
    vy = b.vy - 2 * dot * dy;
  if (paddleOffset !== undefined) {
    const heading = offset(
      Math.atan2(vy, vx) / RAD + C.ENGLISH_DEG_PER_OFFSET_DEG * paddleOffset,
      a / RAD,
    );
    const clamped = Math.max(
      -C.BOUNCE_CLAMP_DEG,
      Math.min(C.BOUNCE_CLAMP_DEG, heading),
    );
    b.vx = speed(wave) * Math.cos(a + clamped * RAD);
    b.vy = speed(wave) * Math.sin(a + clamped * RAD);
    return;
  }
  vx += C.RING_KICK_FACTOR * kick * RAD * radius(b) * tx;
  vy += C.RING_KICK_FACTOR * kick * RAD * radius(b) * ty;
  let heading = Math.atan2(vy, vx) / RAD;
  const radial = vx * nx + vy * ny >= 0 ? a / RAD : a / RAD + 180;
  const phi = offset(heading, radial);
  heading -= Math.sign(phi) * Math.min(C.ORBITAL_DECAY_DEG, Math.abs(phi));
  b.vx = incoming * Math.cos(heading * RAD);
  b.vy = incoming * Math.sin(heading * RAD);
}
function caught(s: KesslerState, kind: C.PodKind): void {
  if (kind === "widen") setEffect(s, kind, C.WIDEN_DURATION_TICKS);
  if (kind === "narrow") setEffect(s, kind, C.NARROW_DURATION_TICKS);
  if (kind === "pierce") setEffect(s, kind, C.PIERCE_DURATION_TICKS);
  if (kind === "shield") s.effects.shieldActive = true;
  if (kind === "multiball")
    for (
      let i = 0;
      i < C.MULTIBALL_LAUNCH_COUNT && s.balls.length < C.BALL_CAP;
      i++
    ) {
      const heading =
        (s.paddle.angleDeg + (i === 0 ? 1 : -1) * C.MULTIBALL_OFFSET_DEG) * RAD;
      s.balls.push({
        ...polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddle.angleDeg),
        vx: speed(s.wave) * Math.cos(heading),
        vy: speed(s.wave) * Math.sin(heading),
        parked: false,
        born: s.simTicks,
      });
    }
}
export type PlayCue = (cue: C.CueName) => void;
/** One complete fixed tick, in the specification's resolution order. */
export function tick(s: KesslerState, turn: number, play: PlayCue): void {
  s.ticks++;
  if (s.screen === "waveclear") {
    s.interstitialTicks = Math.max(0, s.interstitialTicks - 1);
    if (s.interstitialTicks === 0) {
      s.wave++;
      s.rings = rings(s.wave);
      s.screen = "playing";
      park(s);
    }
    return;
  }
  if (s.screen !== "playing") return;
  s.simTicks++;
  s.paddle.angleDeg = norm(
    s.paddle.angleDeg + turn * C.DEFLECTOR_TURN_DEG_PER_SEC * C.TICK_DT,
  );
  const prevAngles = s.rings.map((r) => r.angleDeg);
  s.rings.forEach(
    (r) => (r.angleDeg = norm(r.angleDeg + r.speedDegPerSec * C.TICK_DT)),
  );
  for (const key of ["widenTicks", "narrowTicks", "pierceTicks"] as const)
    s.effects[key] = Math.max(0, s.effects[key] - 1);
  s.pods = s.pods.filter((p) => {
    const before = radius(p),
      a = angle(p),
      r = before - C.POD_FALL_SPEED * C.TICK_DT;
    Object.assign(p, polar(r, a));
    if (
      before > C.DEFLECTOR_POD_CATCH_RADIUS &&
      r <= C.DEFLECTOR_POD_CATCH_RADIUS &&
      Math.abs(offset(a, s.paddle.angleDeg)) <= span(s) / 2
    ) {
      s.score += C.POD_CATCH_SCORE;
      play(p.kind === "narrow" ? C.CUES.podCatchNarrow : C.CUES.podCatch);
      caught(s, p.kind);
      return false;
    }
    if (r <= C.BURNUP_RADIUS) {
      event(s, "burnup", p);
      play(C.CUES.podBurn);
      return false;
    }
    return true;
  });
  let burned = false;
  const survivors: Ball[] = [];
  for (const b of s.balls) {
    if (b.parked) {
      Object.assign(
        b,
        polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddle.angleDeg),
      );
      survivors.push(b);
      continue;
    }
    const prevR = radius(b),
      prevA = angle(b);
    b.x += b.vx * C.TICK_DT;
    b.y += b.vy * C.TICK_DT;
    const r = radius(b),
      a = angle(b);
    const radial = b.vx * Math.cos(a * RAD) + b.vy * Math.sin(a * RAD);
    if (
      prevR > C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      r <= C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      radial < 0 &&
      Math.abs(offset(a, s.paddle.angleDeg)) <= span(s) / 2
    ) {
      reflect(b, false, 0, offset(a, s.paddle.angleDeg), s.wave);
      play(C.CUES.paddleBounce);
      event(s, "spark", b);
    } else if (
      s.effects.shieldActive &&
      prevR > C.SHIELD_CONTACT_RADIUS &&
      r <= C.SHIELD_CONTACT_RADIUS
    ) {
      reflect(b, false, 0);
      s.effects.shieldActive = false;
      play(C.CUES.shieldReflect);
      event(s, "spark", b);
    } else if (
      prevR < C.FIELD_CONTACT_RADIUS &&
      r >= C.FIELD_CONTACT_RADIUS &&
      radial > 0
    ) {
      reflect(b, false, 0);
      play(C.CUES.fieldBounce);
      event(s, "spark", b);
    }
    for (let i = 0; i < s.rings.length; i++) {
      const ring = s.rings[i],
        cfg = C.RINGS[i];
      for (const target of [...ring.targets]) {
        const center =
          ring.angleDeg +
          target.slot * cfg.slotWidthDeg +
          C.STRUCTURAL_GAP_DEG +
          cfg.targetArcDeg / 2;
        const inside = Math.abs(offset(a, center)) <= cfg.targetArcDeg / 2;
        const oldCenter =
          prevAngles[i] +
          target.slot * cfg.slotWidthDeg +
          C.STRUCTURAL_GAP_DEG +
          cfg.targetArcDeg / 2;
        const wasInside =
          Math.abs(offset(prevA, oldCenter)) <= cfg.targetArcDeg / 2;
        const face =
          inside &&
          ((prevR < cfg.innerContactRadius && r >= cfg.innerContactRadius) ||
            (prevR > cfg.outerContactRadius && r <= cfg.outerContactRadius));
        const edge =
          inside &&
          !wasInside &&
          r >= cfg.innerContactRadius &&
          r <= cfg.outerContactRadius;
        if (!face && !edge) continue;
        if (s.effects.pierceTicks > 0) target.hp = 0;
        else {
          target.hp--;
          reflect(b, !face, ring.speedDegPerSec);
        }
        if (target.hp > 0) {
          s.score += C.HIT_SCORE;
          play(C.CUES.targetHit);
        } else {
          ring.targets = ring.targets.filter((t) => t.slot !== target.slot);
          s.score += cfg.destroyScore;
          play(C.CUES.targetBreak);
          const pos = polar(cfg.midRadius, center);
          event(s, "burst", pos);
          if (s.podSpawn) {
            const kind =
              s.nextPod === null
                ? drawPod()
                : s.nextPod === "none"
                  ? null
                  : s.nextPod;
            s.nextPod = null;
            if (kind) s.pods.push({ kind, ...pos });
          }
          if (s.waveAdvance && s.rings.every((r) => r.targets.length === 0)) {
            s.score += C.WAVE_CLEAR_BONUS_PER_WAVE * s.wave;
            s.balls = [];
            resetEffects(s);
            s.screen = "waveclear";
            s.interstitialTicks = C.WAVECLEAR_TICKS;
            play(C.CUES.waveClear);
            return;
          }
        }
      }
    }
    if (r <= C.BURNUP_RADIUS) {
      burned = true;
      event(s, "burnup", b);
      play(C.CUES.ballLost);
    } else survivors.push(b);
  }
  s.balls = survivors;
  if (burned && s.balls.length === 0) {
    s.lives = Math.max(0, s.lives - 1);
    resetEffects(s);
    if (s.lives > 0) park(s);
    else {
      s.screen = "gameover";
      play(C.CUES.gameOver);
    }
  }
}
