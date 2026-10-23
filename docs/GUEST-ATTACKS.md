# Dormant Toriel attack prototype

The Toriel helix is currently **disabled** and is not part of the playable daily route. The live fight uses Sans's original attack sequence. The prototype code, imported sprites, and notes remain in the repository for possible future experimentation.

The integration was previously used to prove a borrowed attack could share the native clock. The game loop no longer imports or invokes it, and the generated native tick hook has been removed. A catalogue, selection of different attacks per day, difficulty budgets, and more soul modes are not implemented.

## Normal damage and KR

The native simulator stores total current HP and pending KR separately. The yellow portion is `HP − KR`; the purple portion is KR.

- Sans attacks keep their original contact damage and KR rules.
- Borrowed attacks call native `DamagePlayer(damage, 0)`. They do not add KR.
- A normal hit lowers total HP while preserving pending KR. For example, **60 HP / 20 KR → 56 HP / 20 KR** after a 4 HP hit. The yellow portion drops from 40 to 36.
- If insufficient HP remains to hold all pending KR, KR is clamped to `max(0, HP − 1)`, matching the existing rule that KR cannot take the final HP. Normal damage can still kill; pending KR provides no shield.
- Existing KR continues decaying during the guest attack and menu. Both damage types flow through the existing actual-HP statistics; food still counts only HP restored.
- Guest hits grant 20 native frames (2/3 second) of invulnerability against guest projectiles. This does not change Sans's continuous contact damage.

The helix uses 4 HP normal hits, from Toriel's 6 AT and the original starting defense of 10. Her original low-HP reductions apply to newly spawned projectiles. Using starting defense here is an explicit prototype balance choice; this simulator does not model equipment defense for guest attacks yet.

## Original pattern and deliberate adaptations

`scripts/import-toriel-assets.py` reads the owned Steam archive without changing the installation. It copies both frames of `spr_firebullet`, preserving the 16×16 canvas, pixels, origin, and collision bounds `[6,8]–[9,11]`. `src/daily/toriel-assets.json` records archive, frame, and native code hashes.

The port follows:

| Original event | Behavior used |
| --- | --- |
| `obj_torielboss Step`, normal-mode command 0–20 | 140-frame turn; one helix every 5 frames |
| `obj_1sidegen Alarm 0`, bullet type 7 | Spawn at arena center minus 3; top minus 25 before the projectile's spawn adjustment; 6 AT and low-HP reductions |
| `blt_firehelix1 Create` | Two-frame animation at 0.5 frame/step; initial vertical speed 0.7; gravity 0.12; left/right choice; top adjustment +20 |
| `blt_firehelix1 Step` | Horizontal speed `±sin(time / 10) × 4` |
| `blt_firehelix1 Collision 762` | At the bottom, restore previous Y, stop vertical motion, redirect gravity horizontally |
| `blt_parent Collision 744` / `SCR_GAMESTART` | Remove a projectile on a successful hit; 20-frame normal invulnerability; existing native hurt sound |

Projectile movement and collision use **C2's browser-driven frame clock**, just like Sans's attacks: normally 60 Hz on a 60 Hz display, 120 Hz on a 120 Hz display, and so on. Each update samples the original trajectory using C2's elapsed time; there is no separate fixed-60-Hz accumulator. Original 1/30-second segment boundaries are still processed for spawning, gravity and bottom bounces, preserving all previous trajectory checkpoints, the daily seed and 140/30-second duration. The 20-native-frame invulnerability still lasts 2/3 second regardless of display refresh rate. Original sprite frames keep their authored playback speed. The projectile canvas uses C2's physical pixel resolution and fractional positions, avoiding a different pixel grid on Retina displays.

The arena is positioned beside the existing Sans HUD, using a 160 px interior width and the current Sans arena's vertical span. Projectiles are clipped to its interior. The sine clock starts at the attack boundary, rather than depending on time spent reading dialogue. Random direction choices use the daily seed. Those changes make retries reproducible; this is an adapted Toriel pattern, not a complete recreation of her encounter, mercy behavior, equipment, or low-HP attack selection.

C2 continues to own heart movement, arena transitions, menus, food, native hurt audio, health bars, dialogue progression, death, and daily attempt lifecycle. A small canvas draws only the imported guest projectiles. A generated native `Every tick` action supplies C2's `dt`; suspension freezes movement, collision, immunity, and duration together. Arena-resize completion starts the pattern. Finishing, losing, stopping, or abandoning clears its drawing layer before another attack can run.

## Validation

`npm test` covers damage/KR separation, lethal hits, actual damage/healing totals, same-day seeds, display-rate independence, duration, pause state, invulnerability, event bindings, and original asset/code identity against the owned archive. `npm run build` checks the production entry points.

Aside browser checks used an isolated origin and restored its previous history afterward. Controlled fixtures verified 60 HP / 20 KR becoming 44 HP / 20 KR after four guest hits, followed by ordinary KR decay on resume. Real keyboard input verified movement and Esc pause during the helix. The guest drawing cleared on completion; the next native Sans blue-bone attack added KR normally. Food subsequently restored HP and recorded the actual healing. Opening combat was skipped for these focused integration checks; they are not evidence of a full legal-input fight clear.

The production build also loaded and rendered the pattern. A lethal guest-hit fixture reached 0 HP / 0 KR, cleared the drawing layer, and completed the native death lifecycle with exactly one daily try spent (6/6 → 5/6).

The first smoothing pass used a separate fixed 60 Hz clock, which still differed from Sans on high-refresh displays. The current version shares the native clock. Tests exercise every update at 60, 75, 120 and 144 Hz, and compare all 140 original trajectory checkpoints to the working 30 Hz prototype. Pause freezes drawing and HP, and the attack returns to the menu with no KR added.

The shared-clock Aside check recorded 120 draws and 119 consecutive position changes in one second on a 120 Hz display. Both canvases used the same 1280×960 pixel resolution. Pause froze movement and HP; completion cleared every projectile pixel.
