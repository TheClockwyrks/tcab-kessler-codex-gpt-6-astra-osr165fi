import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  copy,
  fresh,
  park,
  launch,
  tick,
  span,
  type Assets,
  type KesslerState,
} from "./simulation";
import { debug, type KesslerDebugApi } from "./debug";
import { render } from "./render";
export { BACKGROUND } from "./render";
export type { KesslerState } from "./simulation";
export type { KesslerDebugApi } from "./debug";
export const game: Game<KesslerState, KesslerDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const [planet, balls, podEntries, particleEntries] = await Promise.all([
      api.assets.loadImage(C.SPRITE_PATHS.planet),
      Promise.all(C.SPRITE_PATHS.ball.map((p) => api.assets.loadImage(p))),
      Promise.all(
        C.POD_KINDS.map(
          async (k) =>
            [k, await api.assets.loadImage(C.SPRITE_PATHS.pods[k])] as const,
        ),
      ),
      Promise.all(
        Object.entries(C.PARTICLE_PATHS).map(
          async ([k, p]) =>
            [
              k,
              JSON.parse(
                await (await api.assets.load(p)).text(),
              ) as ParticleSystem,
            ] as const,
        ),
      ),
      ...Object.entries(C.CUE_PATHS).map(([cue, path]) =>
        api.audio.load(cue, path),
      ),
      ...Object.entries(C.BED_PATHS).map(([bed, path]) =>
        api.audio.load(`music-${bed}`, path),
      ),
    ]);
    for (const key of ["screen", "score", "lives", "wave"] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "paddle",
      (s) => `${s.paddle.angleDeg.toFixed(1)}° / ${span(s)}°`,
    );
    api.diagnostics.register("balls", (s) => s.balls.length);
    api.diagnostics.register("targets", (s) =>
      s.rings.reduce((n, r) => n + r.targets.length, 0),
    );
    api.diagnostics.register("pods", (s) => s.pods.length);
    for (const key of [
      "widenTicks",
      "narrowTicks",
      "pierceTicks",
      "shieldActive",
    ] as const)
      api.diagnostics.register(key, (s) => s.effects[key]);
    return [
      fresh({
        planet,
        balls,
        pods: Object.fromEntries(podEntries) as Assets["pods"],
        particles: Object.fromEntries(particleEntries) as Assets["particles"],
      }),
      debug,
    ];
  },
  update(state, api, dt) {
    let s = copy(state);
    s.events = s.events
      .map((e) => ({ ...e, age: e.age + dt }))
      .filter((e) => e.age < 1.5);
    const edges = Object.fromEntries(
      C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
    );
    const turn = api.input.value("right") - api.input.value("left");
    const screen = s.screen;
    const play = (cue: C.CueName) => api.audio.play(cue);
    const arrive = (name: C.Screen, index = 0) => {
      s.screen = name;
      s.menu.index = index;
      s.pointerPress = null;
    };
    if (screen === "title" || screen === "paused") {
      for (const action of ["up", "down"]) {
        if (edges[action]) {
          s.menu.index = (s.menu.index + 1) % C.TITLE_ITEMS.length;
          play(C.CUES.menuMove);
        }
      }
      let accepted = !!edges.confirm;
      for (const p of api.input.pointerSamples()) {
        const index = C.TITLE_ITEMS.findIndex((_, i) => {
          const r = debug.menuItemRect(s, i)!;
          return (
            p.x >= r.x &&
            p.x <= r.x + r.width &&
            p.y >= r.y &&
            p.y <= r.y + r.height
          );
        });
        if (
          index >= 0 &&
          (p.type === "move" || p.type === "down") &&
          index !== s.menu.index
        ) {
          s.menu.index = index;
          play(C.CUES.menuMove);
        }
        if (p.type === "down" && p.button === "primary")
          s.pointerPress = index >= 0 ? { id: p.id, index } : null;
        if (p.type === "up" && s.pointerPress?.id === p.id) {
          if (index === s.pointerPress.index) {
            s.menu.index = index;
            accepted = true;
          }
          s.pointerPress = null;
        }
      }
      if (screen === "paused" && (edges.back || edges.pause)) arrive("playing");
      else if (accepted) {
        play(C.CUES.menuSelect);
        if (screen === "title") {
          if (s.menu.index === 0) {
            const ticks = s.ticks,
              accumulator = s.accumulator;
            s = fresh(s.assets);
            s.ticks = ticks;
            s.accumulator = accumulator;
            arrive("playing");
            park(s);
          } else arrive("howto");
        } else if (s.menu.index === 0) arrive("playing");
        else {
          const ticks = s.ticks;
          s = fresh(s.assets);
          s.ticks = ticks;
        }
      }
    } else if (screen === "howto" && (edges.confirm || edges.back))
      arrive("title", 1);
    else if (screen === "gameover" && edges.confirm) arrive("title");
    else if (screen === "playing") {
      if (edges.back || edges.pause) arrive("paused");
      else if (edges.launch && s.balls.some((b) => b.parked)) launch(s);
    }
    s.accumulator += dt;
    while (s.accumulator + 1e-10 >= C.TICK_DT) {
      s.accumulator = Math.max(0, s.accumulator - C.TICK_DT);
      tick(s, screen === "playing" ? turn : 0, play);
    }
    const bed =
      s.screen === "title" || s.screen === "howto"
        ? "title"
        : s.screen === "gameover"
          ? null
          : "play";
    for (const key of Object.keys(C.BED_PATHS)) {
      if (key === bed) api.audio.loop(`music-${key}`);
      else api.audio.stop(`music-${key}`);
    }
    return s;
  },
  render,
};
