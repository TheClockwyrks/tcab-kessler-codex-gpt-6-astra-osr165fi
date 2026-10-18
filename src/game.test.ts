/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type KesslerState, type KesslerDebugApi } from "./game";
import { polar, angle, reflect, copy, span, speed } from "./simulation";
import * as C from "./constants";
let engine: Engine<KesslerState, KesslerDebugApi>;
let target: EventTarget;
let cues: string[];
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(path)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData() {
        return {};
      }
    },
  );
});
afterEach(() => engine?.destroy());
async function setup() {
  target = new EventTarget();
  cues = [];
  engine = createEngine({
    canvas: createCanvas(1000, 1000) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    clock: new ConstantClock(1000 / C.TICK_HZ),
    surface: {
      cssWidth: () => 1000,
      cssHeight: () => 1000,
      dpr: () => 1,
      events: () => target,
    },
  });
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  await engine.initialize();
  return engine.debug;
}
function key(code: string, type = "keydown") {
  target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
}
async function press(code: string) {
  key(code);
  await engine.advance(1);
  key(code, "keyup");
}
async function playing() {
  const d = await setup();
  engine.apply((s) => d.setScreen(s, "playing"));
  engine.apply((s) => d.setPodSpawn(s, false));
  engine.apply((s) => d.setWaveAdvance(s, false));
  return d;
}
function spawn(r: number, a: number, v: number, heading = a) {
  const p = polar(r, a);
  engine.apply((s) =>
    engine.debug.spawnBall(
      s,
      p.x,
      p.y,
      v * Math.cos((heading * Math.PI) / 180),
      v * Math.sin((heading * Math.PI) / 180),
    ),
  );
}
function snap() {
  return engine.debug.snapshot(engine.state);
}
describe("engine integration and screens", () => {
  it("loads all assets, boots on title and exposes diagnostics", async () => {
    await setup();
    expect(snap()).toMatchObject({
      screen: "title",
      lives: 3,
      wave: 1,
      score: 0,
      ticks: 0,
      balls: [],
    });
    expect(snap().rings.map((r) => r.targets.length)).toEqual([12, 16, 20]);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(12);
  });
  it("starts without also launching, launches on the next press", async () => {
    await setup();
    await press("Space");
    expect(snap().balls[0].parked).toBe(true);
    await press("Space");
    expect(snap().balls[0].parked).toBe(false);
    expect(Math.hypot(snap().balls[0].vx, snap().balls[0].vy)).toBeCloseTo(240);
  });
  it("wraps menu navigation, howto return and pause resume/quit", async () => {
    await setup();
    await press("ArrowUp");
    await press("Enter");
    expect(snap().screen).toBe("howto");
    await press("Escape");
    expect(snap().menu.index).toBe(1);
    await press("ArrowDown");
    await press("Enter");
    await press("KeyP");
    expect(snap().screen).toBe("paused");
    await press("Escape");
    expect(snap().screen).toBe("playing");
    await press("KeyP");
    await press("ArrowDown");
    await press("Enter");
    expect(snap().screen).toBe("title");
    expect(cues).toContain(C.CUES.menuMove);
    expect(cues).toContain(C.CUES.menuSelect);
  });
  it("freezes the field and spin while global ticks continue", async () => {
    const d = await playing();
    engine.apply((s) => d.parkBall(s));
    engine.apply((s) => d.setEffectTicks(s, "pierce", 300));
    engine.apply((s) => d.setScreen(s, "paused"));
    const before = snap();
    await engine.advance(30);
    expect(snap()).toEqual({ ...before, ticks: 30 });
    expect(engine.state.simTicks).toBe(0);
  });
  it("rotates parked balls and wraps at the specified rate", async () => {
    const d = await playing();
    engine.apply((s) => d.parkBall(s));
    key("KeyD");
    await engine.advance(60);
    expect(snap().paddle.angleDeg).toBeCloseTo(0);
    expect(snap().balls[0].x).toBeCloseTo(694);
    key("KeyD", "keyup");
    key("ArrowLeft");
    await engine.advance(60);
    expect(snap().paddle.angleDeg).toBeCloseTo(90);
  });
  it("accumulates fractional frames independent of their distribution", async () => {
    await playing();
    engine.setClock(new SequenceClock([5, 10, 35]));
    await engine.advance(60);
    expect(snap().ticks).toBe(60);
    expect(snap().rings[1].angleDeg).toBeCloseTo(12);
    expect(snap().rings[2].angleDeg).toBeCloseTo(352);
  });
});
describe("crossing contacts and scoring", () => {
  it("reflects a central paddle crossing without moving the integrated position", async () => {
    const d = await playing();
    engine.apply((s) => d.clearTargets(s));
    spawn(197, 90, 240, 270);
    await engine.advance(1);
    expect(snap().balls[0]).toMatchObject({ x: 500, y: 693 });
    expect(snap().balls[0].vy).toBeCloseTo(240);
    expect(cues).toContain(C.CUES.paddleBounce);
  });
  it("applies signed English and the angular clamp", async () => {
    await playing();
    spawn(197, 110, 240, 290);
    await engine.advance(1);
    expect(
      angle({ x: 500 + snap().balls[0].vx, y: 500 + snap().balls[0].vy }),
    ).toBeCloseTo(134);
    const b = { ...polar(193, 0), vx: -1, vy: 100, parked: false, born: 0 };
    reflect(b, false, 0, 24, 1);
    expect((Math.atan2(b.vy, b.vx) * 180) / Math.PI).toBeCloseTo(60);
  });
  it("preserves speed and applies orbital decay at containment", async () => {
    const d = await playing();
    engine.apply((s) => d.clearTargets(s));
    spawn(471, 0, 300, 25);
    await engine.advance(1);
    expect(Math.hypot(snap().balls[0].vx, snap().balls[0].vy)).toBeCloseTo(300);
    expect(snap().balls[0].vx).toBeLessThan(0);
    expect(cues).toEqual([C.CUES.fieldBounce]);
  });
  it("scores inner-ring destruction on a face crossing", async () => {
    await playing();
    spawn(280, 15, 240);
    await engine.advance(1);
    expect(snap().score).toBe(100);
    expect(snap().rings[0].targets).not.toContainEqual({ slot: 0, hp: 1 });
    expect(cues).toEqual([C.CUES.targetBreak]);
    expect(snap().balls[0].vx).toBeLessThan(0);
  });
  it("leaves structural gaps untouched", async () => {
    await playing();
    spawn(280, 0, 240);
    await engine.advance(1);
    expect(snap().score).toBe(0);
    expect(snap().balls[0].vx).toBeCloseTo(240);
  });
  it("damages armor then destroys it, with distinct score and cues", async () => {
    const d = await playing();
    engine.apply((s) => d.setRingSpeed(s, 2, 0));
    spawn(350, 11.25, 240);
    await engine.advance(1);
    expect(snap().score).toBe(50);
    expect(snap().rings[1].targets[0].hp).toBe(1);
    engine.apply((s) => d.clearBalls(s));
    spawn(350, 11.25, 240);
    await engine.advance(1);
    expect(snap().score).toBe(250);
    expect(cues).toEqual([C.CUES.targetHit, C.CUES.targetBreak]);
  });
  it("resolves rotating edges against the previous ring pose", async () => {
    const d = await playing();
    engine.apply((s) => d.setRingSpeed(s, 2, 60));
    spawn(372, 21, 0);
    await engine.advance(1);
    expect(snap().score).toBe(50);
    await engine.advance(1);
    expect(snap().score).toBe(50);
  });
  it("pierces armored targets without changing velocity", async () => {
    const d = await playing();
    engine.apply((s) => d.setEffectTicks(s, "pierce", 100));
    spawn(350, 11.25, 240);
    const before = snap().balls[0];
    await engine.advance(1);
    expect(snap().score).toBe(200);
    expect(snap().balls[0].vx).toBe(before.vx);
    expect(snap().balls[0].piercing).toBe(true);
  });
  it("does not infer a collision from occupying a target", async () => {
    const d = await playing();
    engine.apply((s) => d.setRingSpeed(s, 2, 0));
    spawn(372, 11.25, 0);
    await engine.advance(2);
    expect(snap().score).toBe(0);
  });
});
describe("salvage and lifecycle", () => {
  it.each(C.POD_KINDS)("catches %s through the real crossing", async (kind) => {
    const d = await playing();
    const p = polar(197, 90);
    engine.apply((s) => d.spawnPod(s, kind, p.x, p.y));
    await engine.advance(1);
    expect(snap().score).toBe(25);
    expect(snap().pods).toHaveLength(0);
    if (kind === "widen") expect(snap().paddle.spanDeg).toBe(72);
    if (kind === "narrow") expect(snap().paddle.spanDeg).toBe(30);
    if (kind === "shield") expect(snap().effects.shieldActive).toBe(true);
    if (kind === "pierce") expect(snap().effects.pierceTicks).toBe(360);
    if (kind === "multiball") expect(snap().balls).toHaveLength(2);
  });
  it("replaces opposing span effects and expires before contacts", async () => {
    const d = await playing();
    engine.apply((s) => d.setEffectTicks(s, "widen", 50));
    engine.apply((s) => d.setEffectTicks(s, "narrow", 1));
    expect(snap().effects.widenTicks).toBe(0);
    await engine.advance(1);
    expect(snap().paddle.spanDeg).toBe(48);
  });
  it("caps multiball while keeping the parked ball", async () => {
    const d = await playing();
    engine.apply((s) => d.parkBall(s));
    for (let i = 0; i < 4; i++) spawn(240, i * 30, 0);
    const p = polar(197, 90);
    engine.apply((s) => d.spawnPod(s, "multiball", p.x, p.y));
    await engine.advance(1);
    expect(snap().balls).toHaveLength(6);
    expect(snap().balls[0].parked).toBe(true);
    expect(snap().score).toBe(25);
  });
  it("consumes a shield for only the first crossing in spawn order", async () => {
    const d = await playing();
    engine.apply((s) => d.setShield(s, true));
    spawn(102, 0, 240, 180);
    spawn(102, 180, 240, 0);
    await engine.advance(1);
    expect(snap().balls[0].vx).toBeGreaterThan(0);
    expect(snap().balls[1].vx).toBeGreaterThan(0);
    expect(snap().effects.shieldActive).toBe(false);
    expect(cues.filter((c) => c === C.CUES.shieldReflect)).toHaveLength(1);
  });
  it("burns missed pods without applying their effects", async () => {
    const d = await playing();
    engine.apply((s) => d.spawnPod(s, "shield", 579, 500));
    await engine.advance(1);
    expect(snap().pods).toHaveLength(0);
    expect(snap().effects.shieldActive).toBe(false);
    expect(cues).toContain(C.CUES.podBurn);
  });
  it("consumes a forced drop only when the destruction makes a draw", async () => {
    const d = await playing();
    engine.apply((s) => d.setNextPod(s, "shield"));
    spawn(280, 15, 240);
    await engine.advance(1);
    expect(snap().nextPod).toBe("shield");
    engine.apply((s) => d.setPodSpawn(s, true));
    engine.apply((s) => d.clearBalls(s));
    spawn(280, 45, 240);
    await engine.advance(1);
    expect(snap().nextPod).toBeNull();
    expect(snap().pods[0].kind).toBe("shield");
  });
  it("loses a life only when a burn removes the last live ball", async () => {
    const d = await playing();
    spawn(79, 0, 240, 180);
    spawn(240, 180, 0);
    await engine.advance(1);
    expect(snap().lives).toBe(3);
    engine.apply((s) => d.clearBalls(s));
    await engine.advance(1);
    expect(snap().lives).toBe(3);
    spawn(79, 0, 240, 180);
    await engine.advance(1);
    expect(snap().lives).toBe(2);
    expect(snap().balls[0].parked).toBe(true);
  });
  it("clears effects and reaches gameover at zero lives", async () => {
    const d = await playing();
    engine.apply((s) => d.setLives(s, 1));
    engine.apply((s) => d.setEffectTicks(s, "widen", 10));
    spawn(79, 0, 240, 180);
    await engine.advance(1);
    expect(snap().screen).toBe("gameover");
    expect(snap().effects.widenTicks).toBe(0);
    expect(cues).toEqual([C.CUES.ballLost, C.CUES.gameOver]);
    await press("Enter");
    expect(snap().screen).toBe("title");
  });
  it("awards the final destruction and bonus then refills after 180 ticks", async () => {
    const d = await playing();
    engine.apply((s) => d.clearTargets(s));
    engine.apply((s) => d.spawnTarget(s, 1, 0, 1));
    engine.apply((s) => d.setWaveAdvance(s, true));
    spawn(280, 15, 240);
    await engine.advance(1);
    expect(snap()).toMatchObject({
      screen: "waveclear",
      score: 600,
      interstitialTicks: 180,
      balls: [],
    });
    await engine.advance(179);
    expect(snap().screen).toBe("waveclear");
    await engine.advance(1);
    expect(snap()).toMatchObject({
      screen: "playing",
      wave: 2,
      interstitialTicks: 0,
    });
    expect(snap().rings.map((r) => r.targets.length)).toEqual([12, 16, 20]);
    expect(snap().rings[1].angleDeg).toBe(0);
    expect(snap().balls[0].parked).toBe(true);
  });
});
describe("debug contract", () => {
  it("preserves previous values and validates impossible poses", async () => {
    const d = await setup();
    const before = snap();
    engine.apply((s) => d.setScore(s, 123));
    expect(before.score).toBe(0);
    expect(() => d.setScore(engine.state, -1)).toThrow();
    expect(() => d.launchBall(engine.state)).toThrow();
    engine.apply((s) => d.parkBall(s));
    expect(() => d.parkBall(engine.state)).toThrow();
    expect(() => d.spawnTarget(engine.state, 4, 0, 1)).toThrow();
    expect(() => d.setEffectTicks(engine.state, "widen", 1.5)).toThrow();
    engine.apply((s) => d.setScreen(s, "howto"));
    expect(d.menuItemRect(engine.state, 0)).toBeNull();
    expect(() => d.setMenuIndex(engine.state, 0)).toThrow();
  });
  it("poses wave speeds without changing existing ball velocities", async () => {
    const d = await playing();
    spawn(240, 0, 99);
    engine.apply((s) => d.setRingSpeed(s, 2, 200));
    engine.apply((s) => d.setRingAngle(s, 2, -10));
    engine.apply((s) => d.setWave(s, 100));
    expect(snap().rings[1]).toMatchObject({
      angleDeg: 350,
      speedDegPerSec: 45,
    });
    expect(snap().balls[0].vx).toBe(99);
    expect(speed(100)).toBe(480);
  });
  it("reconciles idempotently and resets every driver switch", async () => {
    const d = await playing();
    engine.apply((s) => d.setShield(s, true));
    engine.apply((s) => d.setNextPod(s, "none"));
    engine.apply((s) => d.setPaddleAngle(s, -30));
    const before = snap();
    engine.apply((s) => d.reconcile(s));
    expect(snap()).toEqual(before);
    expect(span(copy(engine.state))).toBe(48);
    engine.apply((s) => d.reset(s));
    expect(snap()).toMatchObject({
      screen: "title",
      ticks: 0,
      waveAdvance: true,
      podSpawn: true,
      nextPod: null,
      paddle: { angleDeg: 90, spanDeg: 48 },
    });
  });
  it("samples independent pod probabilities without consuming a pose", async () => {
    const d = await setup();
    engine.apply((s) => d.setNextPod(s, "shield"));
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const kind = d.drawPod(engine.state) ?? "none";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    expect(counts.none / 20000).toBeCloseTo(0.75, 1);
    for (const item of C.POD_KIND_TABLE)
      expect(counts[item.kind] / 20000).toBeCloseTo(0.25 * item.probability, 1);
    expect(snap().nextPod).toBe("shield");
  });
});

describe("menu pointer gestures", () => {
  function pointer(type: string, x: number, y: number, device = "mouse") {
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: device,
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  }
  it("highlights on hover and accepts a complete same-region click", async () => {
    const d = await setup();
    const rect = d.menuItemRect(engine.state, 1)!;
    pointer("pointermove", rect.x + 10, rect.y + 10);
    await engine.advance(1);
    expect(snap().menu.index).toBe(1);
    pointer("pointerdown", rect.x + 10, rect.y + 10);
    pointer("pointerup", rect.x + 10, rect.y + 10);
    await engine.advance(1);
    expect(snap().screen).toBe("howto");
    expect(cues).toEqual([C.CUES.menuMove, C.CUES.menuSelect]);
  });
  it("rejects a release outside the originating region", async () => {
    const d = await setup();
    const rect = d.menuItemRect(engine.state, 0)!;
    pointer("pointerdown", rect.x + 5, rect.y + 5);
    await engine.advance(1);
    pointer("pointerup", 20, 20);
    await engine.advance(1);
    expect(snap().screen).toBe("title");
    expect(cues).not.toContain(C.CUES.menuSelect);
  });
  it("accepts touch and ignores pointer input during flight", async () => {
    const d = await setup();
    const rect = d.menuItemRect(engine.state, 0)!;
    pointer("pointerdown", rect.x + 5, rect.y + 5, "touch");
    pointer("pointerup", rect.x + 5, rect.y + 5, "touch");
    await engine.advance(1);
    expect(snap().screen).toBe("playing");
    pointer("pointerdown", 330, 700);
    pointer("pointerup", 330, 700);
    await engine.advance(1);
    expect(snap().balls[0].parked).toBe(true);
  });
});
