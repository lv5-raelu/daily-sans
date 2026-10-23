> This document describes the previous implementation, preserved in `src/fight/` without a production entry point. The default page runs Jcw87’s simulator with daily rules and restored dialogue. Paths below are relative to the project root unless linked.

# Preserved experimental TypeScript engine

A Sans fight recreation for the browser, replacing the initial 42-second practice game. **This is not yet a verified 1:1 recreation of UNDERTALE.** The target is the original battle; daily rules and sharing come after combat parity.

## Run

```sh
npm ci
npm run import:undertale
npm run dev -- --port 5174 --strictPort
npm test
npm run build
```

Open http://127.0.0.1:5174/. The user-run development server already uses that port. Production files are written to `dist/`.

The importer requires Python 3 and defaults to the macOS Steam installation. To import another location, run `npm run import:undertale -- "/path/to/UNDERTALE.app"`. It reads the game archive and writes only a generated project asset pack. No game installation or save files are changed.

The current reference is the installed macOS Steam build **4279148**, archive SHA256 `91a8acf1f40bd7c45d0bdb978de55187e7fb2cd76a1e2cda41c078dd44d3565e`. The imported pack contains 44 sprites / 106 frames, six bitmap fonts with their original glyph metrics, 19 unconverted effects, three music tracks, and 154 fight localization entries. Generated assets are excluded from Git.

## Current implementation

- Native 640×480 canvas, nearest-neighbor scaling, original sprite pixels and origins, bitmap fonts with per-glyph spacing, battle buttons, and recorded sound effects imported from Steam.
- A fixed 30 Hz combat clock; 92 HP / LV 19; red movement, variable-height blue jumps, directional gravity, slams, blue bones, platforms, bone walls, and blasters.
- Moving platform startup now follows the original compiled logic: initial delay, quarter-pixel acceleration, then 3 pixels per native frame.
- Original writer settings supply dialogue character spacing, line height, font selection, and reveal speed. The final opening line uses its original plain font and silent, slower reveal.
- Frame damage and a purple KR bar with nonlethal delayed damage, replacing the previous grace-period damage model.
- Fight / Act / Item / Mercy menus, attack timing and Sans dodging, a preset eight-item inventory, separate turn and attack-attempt counters, both combat phases, and the final attack timeline.
- Keyboard, touch controls, mute, fullscreen, pause on lost focus, and instant retry. No daily attempt cap is imposed yet.

| Input | Action |
| --- | --- |
| Arrow keys | Move; jump opposite gravity when blue |
| Z / Enter | Confirm; advance dialogue; stop the attack bar |
| X | Cancel; slow movement during attacks |
| Shift | Additional slow-movement shortcut |
| Esc | Pause / resume |
| R | Restart |

The original prototype is preserved under `archive/initial-prototype/` and is no longer served or tested.

## Fidelity status

See [PARITY.md](PARITY.md) for the remaining differences and verification plan. Full turn dialogue, menu attacks, exact opening choreography, weapon/armor variations, collision edge cases, and the ending still need work. The current endpoint is a simplified completion state, not the original ending sequence. Imported localization includes the full source text; only the opening is currently wired into the battle.

Do not treat a successful test run as evidence that combat matches UNDERTALE. Automated checks verify the implementation's consistency and that all 24 reference timelines terminate; they do not prove the original timings or a legal no-hit clear. A separate legal-input test survives the current opening without health overrides.

Aside browser checks verified readable dialogue, the opening slam and bone wall, pause/resume, a legal-input opening clear with 11 HP remaining, menu navigation, item consumption, and recovery to 92 HP. The legal-input automated trace finishes with 12 HP; browser input timing differs slightly. Browser checks caught and corrected dialogue contrast, item-name overlap, and the source heart sprite's rotation. Full-fight playability and audible mixing remain unverified.

With the Steam pack enabled, Aside also verified original fonts and intro text, decoded all 19 native effects, and completed the opening with legal inputs. MEGALOVANIA was requested successfully from the local imported file using HTTP range requests; no third-party game asset requests were observed.

## Sources and assets

Original game and game artwork / audio: **UNDERTALE, Toby Fox**. The active original asset pack comes directly from the user's Steam installation. `public/undertale-original/manifest.json` records the archive identity, original resource names, bounds, origins, glyph metrics, and generated file hashes. Sprite extraction preserves the texture pixels and transparent padding; effects and music are copied byte for byte.

The earlier reference assets and attack timelines came from [Jcw87's Bad Time Simulator](https://github.com/Jcw87/c2-sans-fight/tree/gh-pages). Its [Construct 2 source project](https://github.com/Jcw87/c2-sans-fight) is public. This project uses a new TypeScript canvas engine; it does not embed or execute the Construct runtime. The earlier images remain as a development fallback when no native pack has been imported.

The [vanilla UndertaleDecomp source](https://github.com/kittibyte/UndertaleDecomp/tree/vanilla) supplied initial behavior references. The installed macOS archive is now authoritative. `python3 scripts/inspect-undertale.py` creates local disassembly listings for original fight events under `reference/steam-build/code/`; it never executes game bytecode. Those generated listings are excluded from Git and the browser build.

`public/undertale/` contains the older reference images and effects, with source URLs and hashes in `provenance.json`. All game assets retain their original ownership. No application has been published.

MEGALOVANIA and the intro ambient track now load from the imported local files. The native build makes no third-party asset or soundtrack requests. Music starts after the opening attack. Import the original pack before running a fresh checkout; the development fallback does not include the soundtrack.

Importer checks compare all generated sprite pixels, original sprite origins/bounds, font textures and metrics, effects, music, and code entry boundaries against the installed archive. They establish asset/data fidelity, not complete fight parity or a frame-matched original-game clear.

## Code

- `src/fight/battle.ts`: fight state, menus, turn progression, projectiles, collisions.
- `src/fight/physics.ts`: native-frame soul physics and HP/KR.
- `src/fight/timeline.ts`: timing and branch interpreter; bounded loops fail explicitly.
- `src/fight/reference-data.json`: reference sprite frames and attack CSV data.
- `src/fight/assets.ts`, `renderer.ts`, `audio.ts`: presentation and asset loading.
- `src/fight/original.ts`: original sprite origins, glyph drawing, and imported asset manifest.
- `scripts/import-undertale.py`, `undertale_archive.py`: dependency-free, read-only GameMaker archive importer.
- `scripts/inspect-undertale.py`: local original-event disassembly for mechanics audits.
- `src/main.ts`: input, focus, lifecycle, and surrounding controls.
- `tests/fight.test.ts`: timelines across 20 random seeds, physics, damage, menus, frame-rate independence, and asset integrity.
- `tests/test_undertale_archive.py`: binary/image extraction tests and installed-copy integration checks. Integration checks skip when the owned copy or generated pack is absent.
