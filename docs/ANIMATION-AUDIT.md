# Sans animation audit

The reference is the installed macOS Steam build 4279148, archive SHA256 `91a8acf1f40bd7c45d0bdb978de55187e7fb2cd76a1e2cda41c078dd44d3565e`. `src/daily/animation-data.json` records the source bytecode hashes, turn poses and original image hashes. `scripts/import-animation-assets.py` derives the turn poses and gesture head offsets from the native events and copies 19 original frames without changing their pixels.

| Area | Mismatch found | Correction |
| --- | --- | --- |
| First Fight response | Its wink and shrug are assigned by Alarm 6, outside the dialogue string, and were omitted. | Turn 1 starts with face 3 and torso 1. |
| Other initial shrugs | Initial body state was ignored. | Turns 7–12 and 14 also begin with their native shrug. |
| Body controls | `\M` commands were discarded. | Torso changes execute at their original text positions and persist across pages. |
| Glances and fatigue | Faces 1, 2 and 9 were mapped to default, the opposite glance, or eyelessness. | They use the exact pixel-matched LookLeft, Tired1 and Tired2 sprites. |
| Expression timing | The last `\E` on a page was applied before the page began. | Each expression changes when its position in the text is revealed; revealing the full page applies all remaining cues in order. |
| Sweat | Native dialogue-stage assignments were missing. | Stages 13–19 use level 2; 20–21 level 1; 22 level 2; 23 level 0; final speech level 3. The spare sequence starts with its native closed eyes and level 2 sweat. |
| Return to combat | A dialogue pose could remain through the next attack. | Normal speech completion restores face/torso 0 as native Alarm 5 does, while retaining sweat. Opening and final speech retain their separate scripted faces. |
| Gesture frames | Right/left had 5 frames instead of 6; down 4 instead of 5; up 5 instead of 6. The cropped frames also lost pixels. | Complete original sequences and original canvas bounds are restored. |
| Head attachment | Several arm-animation head positions were displaced by 2–4 pixels. | Head offsets are derived from `arm_i` branches in the native Draw event. |
| Gesture cadence | All gestures used 15 fps. | Native `aspeed` phases use 15, 30 or 7.5 fps, including the final attack's exhausted gestures. |
| Glowing eye | The simulator randomly selected a frame each browser tick. | The original two-frame eye alternates at 15 fps. |
| Idle/tired motion | Periods, amplitudes and head/torso offsets were approximated. | The original `siner` path drives both parts continuously at the browser's refresh rate, including their shared horizontal offset and distinct vertical offsets. |
| Dodge motion | Position followed sine/cosine easing; restoring the native 30 Hz steps then made motion choppy. | Native positions retain a speed of 12, acceleration/deceleration of 2, and a 102-pixel displacement. Interpolation fills the gaps for smooth 60+ FPS motion. The simulator still owns turn scheduling. |
| Sitting alignment | The center and torso attachment were displaced. | Original sprite center and native 20-pixel torso displacement are restored. |
| Post-opening sequence | The first encounter and first retry variants played consecutively. | The daily fight uses the first-encounter branch; its original fast writer cadence is restored. |

The face and torso choices during repeated offscreen passes already match the native `choose` calls, so those choices are retained. Other upstream combat CSVs, sounds and the minified runtime are unchanged.

Unit checks cover every reachable dialogue pose and inline cue, all 23 turn introductions, original image hashes, gesture frame counts and head attachments, gesture cadence transitions, native bobbing paths, and dodge position traces. Browser fixtures compare rendered faces, torsos and sweat against independently parsed original text controls before and after reveal. They also inspect the real gesture dimensions/head offsets and scripted end states. These fixtures are not legal full-fight clears.

The 60 FPS smoothing check entered Fight through real keyboard input and recorded 97 native dodge updates across the outward and return phases on a 120 Hz display. Positions changed between the old 30 Hz checkpoints and still ended at X=320 before the original wink/shrug dialogue.

This audit covers the character animations reachable in the current daily simulator. The simulator still has its abbreviated ending. The original special-attack waiting sequence and the sleeping, wounded and departing ending are not implemented; this change does not establish complete original-game parity.
