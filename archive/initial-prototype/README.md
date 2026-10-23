# Daily Sans

A playable first milestone for a daily Sans-inspired browser game: one authored, 42-second encounter with three phases, instant retries, and a result screen.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.

```sh
npm test       # Combat and persistence checks
npm run build  # Type checking and production build → dist/
npm run preview
```

The application runs entirely in the browser. No account, server, API key, or runtime package is required. Vite, TypeScript, and tsx are development tools only. The production build includes all artwork and sounds; it makes no font, asset, or API requests to third-party services.

## Play

Survive all 42 seconds with at least 1 HP. Every attempt starts at 92 HP and plays the same sequence.

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Move |
| Up / W / Space | Jump when the soul is blue; hold for a higher jump |
| Enter | Start or retry |
| R | Restart immediately |
| Esc / P | Pause or resume |

Touch controls appear on small screens and touch devices. The encounter pauses when the page loses focus, goes into the background, or encounters a long rendering stall. Closing the instructions resumes a fight only if opening them paused it.

The phases introduce free movement and bone gaps, gravity and jumpable bones, then warned blaster lanes mixed with bones. Bone hits deal 12 damage and beams deal 16, with a 0.65-second grace period after a hit. This deliberately simplified damage model does not reproduce Undertale's KR system.

Attempt count, clears, best survival, best remaining health, and the last result are stored in localStorage under the encounter's versioned ID. Blocked or full storage does not prevent play; the interface shows a session-only notice. Restarted or abandoned runs count as attempts. This is practice mode with unlimited retries, not an enforced daily challenge.

## Structure

- `src/game/encounter.ts` — encounter identity, phases, attack timeline, and tuning.
- `src/game/simulation.ts` — rendering-independent combat at a fixed 120 simulation steps per second. Movement, spawning, collisions, damage, and results share this clock.
- `src/game/scene.ts` — native Canvas 2D rendering and original pixel art.
- `src/game/input.ts` — keyboard and touch controls.
- `src/game/audio.ts` — original effects synthesized with Web Audio.
- `src/main.ts` — interface, lifecycle, pause behavior, and result handling.
- `src/storage.ts` — versioned local progress and graceful storage failure handling.

The renderer receives simulation state and never controls combat timing. A framework such as Phaser can replace it later without changing encounter rules. Attacks currently have authored, deterministic parameters; no random generator is needed for this milestone. For a daily mode, a date-specific challenge can select a versioned, tested attack sequence and retain its ID in every result.

## Verification

Tests cover countdown behavior, movement normalization and arena bounds, circular hitboxes, damage grace periods, variable-height jumps, blaster warnings, death and retry resets, persistence failures, and matching outcomes at 30/60/144 render frames per second. A full run driven only by legal movement and jump inputs proves that every phase can be cleared without damage.

Browser smoke testing in Aside verified the desktop layout, a 390-pixel browser-frame layout, instructions, pause/resume, keyboard retries, loss and victory screens, held on-screen direction controls, and saved progress after reload. A full run using normal keyboard inputs cleared the encounter with 32 HP remaining. Testing also caught and fixed stale phase indicators during a retry's countdown.

Physical touchscreen ergonomics and audible sound playback still need hands-on device testing. The narrow-screen check used a browser frame rather than a physical phone.

## Scope and credits

This is an unofficial fan prototype inspired by **UNDERTALE** by Toby Fox. It contains an original simplified skeleton placeholder, generated bone/blaster graphics, and synthesized effects. No code, sprites, music, or recordings from Undertale or Jcw87's Bad Time Simulator are included. The placeholder and attack sequence are not intended as an accurate recreation of the full Sans fight.

Daily rotation, sharing, leaderboards, KR damage, menus/healing, platforms, and a faithful full fight are future milestones.
