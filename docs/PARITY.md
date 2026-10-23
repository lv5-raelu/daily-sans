# Experimental engine: original Sans fight parity

**Scope:** This document describes the preserved TypeScript engine in `src/fight/`. The default application now uses Jcw87’s simulator with restored dialogue and a Normal-only daily event graph; its known differences are documented in the upstream README and the project README.

The acceptance target is the complete original Sans fight, not a short Sans-inspired survival round. **Parity has not been achieved.** The installed macOS Steam build 4279148 is now the primary reference; the simulator and Xbox decompilation are secondary references.

## Installed reference

`game.ios` SHA256: `91a8acf1f40bd7c45d0bdb978de55187e7fb2cd76a1e2cda41c078dd44d3565e`.

`npm run import:undertale` imports native textures, sprites, glyph metrics, sound effects, music, and fight localization into `public/undertale-original/`. `python3 scripts/inspect-undertale.py` exports readable VM instruction listings under `reference/steam-build/code/`. Both are read-only with respect to the installation. The imported asset manifest also records hashes of relevant original code events.

## Sources

- [Original game](https://undertale.com/).
- [Public simulator source](https://github.com/Jcw87/c2-sans-fight), including the author's documented inaccuracies.
- [Vanilla game code reference](https://github.com/kittibyte/UndertaleDecomp/tree/vanilla).
- [Original heart update](https://github.com/kittibyte/UndertaleDecomp/blob/vanilla/objects/obj_heart/Step_0.gml) and keyboard events.
- [Original fight controller](https://github.com/kittibyte/UndertaleDecomp/blob/vanilla/objects/obj_sansb/Step_0.gml).
- [Original boss update and KR rules](https://github.com/kittibyte/UndertaleDecomp/blob/vanilla/objects/obj_sansb_body/Draw_0.gml).

## Implemented foundation

- 640×480 screen, 30 native frames per second, 92 HP, LV 19.
- Native game sprites and effects are imported directly from the installed Steam archive. All 106 imported frames retain their original pixels, dimensions, origins, and bounds. Font glyph textures, advances, offsets, and kerning are imported rather than approximated. Native effect and soundtrack bytes match the installation.
- Movement uses 5 pixels per native frame, diagonal movement is not normalized, and cancel halves speed.
- Blue jumping starts at −6 pixels per frame and uses the original sequential, piecewise velocity changes. Gravity rotates for slams.
- Frame-based contact damage, six KR on first bone contact / ten on first beam contact, further KR accumulation, a 40 KR cap, and nonlethal KR decay. Base decay intervals are 1 / 2 / 5 / 15 / 30 frames. HP changes postpone a decay tick.
- Separate turn and attack-attempt counters. Healing consumes a turn without advancing attack attempts; late phases progress by enemy turns. The final attack is triggered at 23 attack attempts.
- All 24 simulator attack timelines can execute, including their labels, arithmetic, conditionals, random choices, blackouts, and the long final sequence.
- Moving platform startup was checked against the installed `obj_boneplat Draw_0` instructions: speed begins at zero, rises by 0.25 pixels/frame on frames 5–20, and becomes 3 pixels/frame on frame 21. A regression test covers position and rider displacement during the transition.
- The original opening localization is used, including source line breaks. Timing controls in that text still need to be applied by the dialogue engine.
- Writer profiles are extracted from the original `SCR_TEXTTYPE` instructions. Narration and Sans use their native spacing and reveal speed; the threat profile uses `fnt_plain`, 9-pixel spacing, 4-frame typing, and no voice. Inline pauses and the exact scene transition still need work.

## Outstanding work

| Area | Remaining difference / verification |
| --- | --- |
| Opening | Currently based on the simulator's choreography and sine-bone approximation. Replace it with original frame counts, bone oscillation, blaster positioning, dialogue transitions, and sound envelopes. |
| Phase one | Validate every spawn against original code. The harder randomized bone-gap variant currently reuses the standard reference variant. |
| Moving platforms | Initial acceleration is ported from the installed archive. Verify spawn coordinates, reversal edges, one-way collision behavior, and complete attack traces against the original. |
| Phase two | The attack families and separate turn counters are present; exact selection rules, blackout cleanup, and timing need original-game comparison. |
| Menu hazards | Moving menu bones are not implemented. Menus are currently safe apart from outstanding KR. |
| Hit detection | Original sprite bounds and narrowed bone shafts inform the current rectangles; clipping, caps, platform edges, moving blue-bone contacts, and beam widths need frame comparisons. |
| KR and equipment | Base KR behavior is implemented. Armor invulnerability bonuses, weapon attack timing, and equipment-dependent randomness are not implemented. Inventory is a fixed development preset. |
| Dialogue | 154 fight localization entries are imported and the opening uses original text. Turn dialogue, repeated-death variations, inline pause/emotion controls, flavor text, and full item / Act behavior remain incomplete. |
| Animation | Original frames are used, but idle offsets, arm/head synchronization, final scrolling, sleep states, and death visuals are not all exact. |
| Ending | Waiting / pushing the box to the Fight button exists, followed by a simplified completion. Original sleep interruption, double strike, wound sprites, dialogue, walk-off, and battle rewards are missing. |
| Audio | Native effects, MEGALOVANIA, intro ambience, and interlude music are imported locally. Effects are mapped using original event resource IDs where checked. Exact mixing, envelopes, loop points, pitch changes, interlude triggers, and ending audio remain unverified. |
| Platform | macOS Steam build 4279148 is pinned by archive hash. Live matching-input original-game comparison remains outstanding. |

## Verification needed before calling it 1:1

1. Pin an original game version, equipment, inventory, and repeat-death state.
2. Use matching scripted input traces on the original and browser versions. Compare positions, velocity, bounds, projectile births, damage, and KR once per native frame.
3. Compare opening, each attack family, healing and failed attacks, phase transitions, menu hazards, final sequence, and ending.
4. Compare sprite alignment and audio event timing against original captures.
5. Require legal-input clears of both phases and the complete ending. Keep timeline-only invulnerable fixtures distinct from playability checks.
6. Apply daily selection, results persistence, and sharing only after this gate passes.
