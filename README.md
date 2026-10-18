# Kessler

An orbital demolition arcade game. Ride a deflector around a warm planet, steer a spinning demolition ball into three rings of derelict satellites, and catch the salvage that falls from the wreckage. Clear all 48 targets to reach the next, faster wave. Three lives; endless sky.

## Play locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Sound starts after your first key or pointer gesture.

## Controls

| Action | Keys |
| --- | --- |
| Orbit left / right | Left / Right arrows or A / D |
| Launch | Space |
| Pause / resume | P or Escape |
| Menu selection | Up / Down arrows or W / S |
| Confirm | Enter or Space |
| Return from instructions | Escape, Enter, or Space |
| Diagnostic overlay | Backtick |

Menus also accept mouse, pen, and touch. Flight uses the keyboard. Strike the deflector away from its center to steer your return. Teal salvage widens it, coral narrows it, gold launches extra balls, blue supplies a one-use shield, and violet lets balls pierce armor.

## Production build

```sh
npm run build
npm run preview
```

Publish the complete `dist/` directory to any static host, at the root or under a subdirectory. There is no backend, external asset service, or runtime credential.

All sprites, animation frames, particle definitions, cues, and music are committed under `assets/`. The `public/assets` symlink exposes that directory to Vite's ordinary static-file copying. Building only compiles and bundles these files; it never runs an asset-generation binary. `tools/produce-assets.py` records the one-time authoring process for environments with those optional tools installed.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The engine-based tests run against an in-process canvas and counted clocks. They exercise menu input, fixed ticks, relative ring crossings, reflection, scoring, salvage, lifecycle, and immutable debug poses. The simulation lives in `src/simulation.ts`; `src/debug.ts` provides the typed automation surface, and `src/render.ts` renders the field and screens. The engine owns input, audio, fitting, recording, and the loop.

The `showcase/` directory contains captured gameplay, a replay of the game's drawing commands, and a player-facing introduction.
