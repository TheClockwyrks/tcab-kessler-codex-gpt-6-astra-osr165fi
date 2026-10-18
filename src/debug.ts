import * as C from "./constants";
import {
  copy,
  fresh,
  span,
  speed,
  orbit,
  norm,
  polar,
  park,
  launch,
  drawPod,
  setEffect,
  type State,
  type KesslerState,
} from "./simulation";
function valid(test: boolean, message = "Invalid debug argument"): void {
  if (!test) throw new RangeError(message);
}
function integer(n: number, min = 0): void {
  valid(Number.isInteger(n) && n >= min);
}
function finite(...ns: number[]): void {
  valid(ns.every(Number.isFinite));
}
function ringIndex(n: number): number {
  integer(n, 1);
  valid(n <= C.RINGS.length);
  return n - 1;
}
function pose(s: State, fn: (next: KesslerState) => void): KesslerState {
  const next = copy(s);
  fn(next);
  return next;
}
export const debug = {
  reset: (s: State) => fresh(copy(s).assets),
  reconcile: (s: State) => copy(s),
  snapshot: (s: State) => ({
    screen: s.screen,
    ticks: s.ticks,
    wave: s.wave,
    score: s.score,
    lives: s.lives,
    interstitialTicks: s.interstitialTicks,
    waveAdvance: s.waveAdvance,
    podSpawn: s.podSpawn,
    nextPod: s.nextPod,
    paddle: { ...s.paddle, spanDeg: span(s) },
    balls: s.balls.map((b) => ({
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      parked: b.parked,
      piercing: s.effects.pierceTicks > 0,
    })),
    rings: s.rings.map((r) => ({
      ...r,
      targets: r.targets.map((t) => ({ ...t })),
    })),
    pods: s.pods.map((p) => ({ ...p })),
    effects: { ...s.effects },
    menu: { ...s.menu },
  }),
  menuItemRect: (s: State, index: number) =>
    (s.screen === "title" || s.screen === "paused") &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < C.TITLE_ITEMS.length
      ? {
          x: 330,
          y: (s.screen === "title" ? 620 : 520) + index * 72,
          width: 340,
          height: 56,
        }
      : null,
  setScreen: (s: State, name: C.Screen) => {
    valid(C.SCREENS.includes(name));
    return pose(s, (n) => {
      n.screen = name;
    });
  },
  setScore: (s: State, v: number) => {
    integer(v);
    return pose(s, (n) => {
      n.score = v;
    });
  },
  setLives: (s: State, v: number) => {
    integer(v);
    return pose(s, (n) => {
      n.lives = v;
    });
  },
  setMenuIndex: (s: State, v: number) => {
    valid(debug.menuItemRect(s, v) !== null);
    return pose(s, (n) => {
      n.menu.index = v;
    });
  },
  setInterstitialTicks: (s: State, v: number) => {
    integer(v);
    return pose(s, (n) => {
      n.interstitialTicks = v;
    });
  },
  setWave: (s: State, v: number) => {
    integer(v, 1);
    return pose(s, (n) => {
      n.wave = v;
      n.rings.forEach((r, i) => {
        r.speedDegPerSec = orbit(i, v);
      });
    });
  },
  setPaddleAngle: (s: State, v: number) => {
    finite(v);
    return pose(s, (n) => {
      n.paddle.angleDeg = norm(v);
      n.balls.forEach((b) => {
        if (b.parked)
          Object.assign(
            b,
            polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, n.paddle.angleDeg),
          );
      });
    });
  },
  launchBall: (s: State) => pose(s, launch),
  clearBalls: (s: State) =>
    pose(s, (n) => {
      n.balls = [];
    }),
  spawnBall: (s: State, x: number, y: number, vx: number, vy: number) => {
    finite(x, y, vx, vy);
    valid(s.balls.length < C.BALL_CAP, "Ball capacity reached");
    return pose(s, (n) => {
      n.balls.push({ x, y, vx, vy, parked: false, born: n.simTicks });
    });
  },
  parkBall: (s: State) => {
    valid(
      s.balls.length < C.BALL_CAP && !s.balls.some((b) => b.parked),
      "Cannot park another ball",
    );
    return pose(s, park);
  },
  clearTargets: (s: State) =>
    pose(s, (n) => {
      n.rings.forEach((r) => {
        r.targets = [];
      });
    }),
  spawnTarget: (s: State, ring: number, slot: number, hp: number) => {
    const i = ringIndex(ring);
    integer(slot);
    valid(slot < C.RINGS[i].slots);
    integer(hp, 1);
    return pose(s, (n) => {
      n.rings[i].targets = [
        ...n.rings[i].targets.filter((t) => t.slot !== slot),
        { slot, hp },
      ].sort((a, b) => a.slot - b.slot);
    });
  },
  setRingAngle: (s: State, ring: number, deg: number) => {
    const i = ringIndex(ring);
    finite(deg);
    return pose(s, (n) => {
      n.rings[i].angleDeg = norm(deg);
    });
  },
  setRingSpeed: (s: State, ring: number, v: number) => {
    const i = ringIndex(ring);
    finite(v);
    return pose(s, (n) => {
      n.rings[i].speedDegPerSec = v;
    });
  },
  clearPods: (s: State) =>
    pose(s, (n) => {
      n.pods = [];
    }),
  spawnPod: (s: State, kind: C.PodKind, x: number, y: number) => {
    valid(C.POD_KINDS.includes(kind));
    finite(x, y);
    return pose(s, (n) => {
      n.pods.push({ kind, x, y });
    });
  },
  setNextPod: (s: State, kind: C.PodKind | "none") => {
    valid(kind === "none" || C.POD_KINDS.includes(kind));
    return pose(s, (n) => {
      n.nextPod = kind;
    });
  },
  drawPod: (_s: State) => drawPod(),
  setEffectTicks: (
    s: State,
    kind: "widen" | "narrow" | "pierce",
    ticks: number,
  ) => {
    valid(["widen", "narrow", "pierce"].includes(kind));
    integer(ticks);
    return pose(s, (n) => setEffect(n, kind, ticks));
  },
  setShield: (s: State, active: boolean) => {
    valid(typeof active === "boolean");
    return pose(s, (n) => {
      n.effects.shieldActive = active;
    });
  },
  setWaveAdvance: (s: State, on: boolean) => {
    valid(typeof on === "boolean");
    return pose(s, (n) => {
      n.waveAdvance = on;
    });
  },
  setPodSpawn: (s: State, on: boolean) => {
    valid(typeof on === "boolean");
    return pose(s, (n) => {
      n.podSpawn = on;
    });
  },
};
export type KesslerDebugApi = typeof debug;
export { speed };
