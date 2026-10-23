# Daily Sans

A daily Sans fight using Jcw87’s Bad Time Simulator runtime and attack scripts, with restored original dialogue, six attempts per UTC day, saved results, streaks, and sharing.

The daily fight currently uses Sans's original attack sequence. A Toriel fireball helix prototype is retained as dormant code for future experimentation, but it does not appear in the playable fight. See [the prototype notes](docs/GUEST-ATTACKS.md) for its implementation details.

## Run

```sh
npm ci
npm run dev -- --port 5174 --strictPort
npm test
npm run build
```

Open http://localhost:5174/. The user-run Vite server already uses this port. The production build is written to `dist/`; no deployment has been made.

Use the Pause button or **Esc** to pause/resume, including while the fight canvas has focus. Pausing dims the fight beneath a “paused” screen with a Resume button. Switching away from the tab or leaving fullscreen pauses the fight as well.

Sans and borrowed attacks share C2's browser-driven frame clock: 60 updates per second on a 60 Hz display, or higher on a high-refresh display. Borrowed projectile movement and collision use the same elapsed time as Sans's attacks, and their drawing canvas matches C2's physical pixel resolution. Smoothing preserves attack speeds, spawn intervals and duration; original sprite frames and dialogue retain their authored playback timing.

## Daily rules

- The counter starts at `6/6 left` and spends a try only for a failed or unfinished fight. A win on the first try stays at `6/6`; a win after one failure stays at `5/6`. The active fight reserves its current try, preventing concurrent starts.
- All attempts use Normal mode. The start menu, MainMenu layout/event sheet, and alternate mode branches have been removed from the exported project.
- A win completes the day. After six unsuccessful attempts, daily play is locked and a prominent link points to [Jcw87’s simulator](https://jcw87.github.io/c2-sans-fight/) for unlimited practice.
- Reloading, closing, or ending an unfinished attempt keeps it spent. Reloading the game frame cannot relaunch the same attempt.
- Each day resets at **00:00 UTC**. An attempt still running at midnight ends as abandoned; its counters stay with its original day.
- A streak counts consecutive days with a win. Sharing retains the previous streak while today is unfinished, then resets it after a missed day or an exhausted unsuccessful day.

Results are stored in this browser’s `localStorage`. Web Locks prevent simultaneous daily fights and serialize saves across tabs. This supports reloads and multiple tabs on the same origin; it is not account-based or tamper-proof. Clearing browser storage or using another browser/device can reset local limits. Server-backed identity and storage would be needed for cross-device enforcement.

## Dialogue and statistics

The original lines come from the user’s Steam installation, macOS build 4279148, archive SHA256 `91a8acf1f40bd7c45d0bdb978de55187e7fb2cd76a1e2cda41c078dd44d3565e`. The original `obj_sansb` Alarm 6 event maps lines to `hit_try`; the corresponding simulator field is **HitAttempts**, distinct from **NextAttack**.

The bridge restores the full opening, first-encounter post-opening remarks, dialogue for all 23 successful Fight stages, and break / final-attack cues. Food and ACT turns do not advance or repeat these stages. Speech uses manually confirmed pages, native normal/fast character cadences and parsed pause markers. After the opening's first three pages, the native event's 10-frame lead-in, 8-frame blackout and 20-frame pause precede the silent threat, with the heart visible and Sans eyeless. The threat uses the original small speech bubble and `fnt_plain` atlas copied from the installed game; other speech uses the simulator's font. Native initial poses and inline face/torso controls drive each dialogue page, including the first response's shrug and wink. Press X to reveal a page, then Z to continue.

The [animation audit](docs/ANIMATION-AUDIT.md) lists the corrected poses, faces, sweat, arm frames/head offsets, animation speeds, eye alternation, bobbing, dodge movement and sitting alignment. The 79 implemented dialogue pages use source-derived cues. The original ending remains unimplemented.

Sans's voice restarts the unchanged upstream sample for each newly revealed non-whitespace character, matching the native writer's stop/play behavior. A 3 ms gain ramp at each start and cutoff prevents the waveform discontinuity from an abrupt Web Audio stop. Repeated triggers for the same character are suppressed, including on the simulator's native victory page. Pausing and finishing fade out speech without stopping unrelated effects or music.

The original `mus_birdnoise.ogg` loops during the opening monologue at its native volume. It stops in the first `BlackScreen,1` event, before the blackout is applied and before the silent threat. This matches native `obj_sansb Step con == 6`, immediately before `snd_play(107)`. Pausing suspends the ambience with the fight; resuming after its cutoff does not restart it. A conversation keeps a single speech bubble and fixed placement between pages, avoiding a blank frame or texture reinitialization. The upstream attack-loading counter is hidden.

The arena is prepared before the blackout command in the same simulation tick, because the upstream instant-resize function also makes its border visible. `BlackScreen,1` then hides the prepared border until `BlackScreen,0` reveals it; no arena border should be visible during the 8-frame blackout.

The fight page shows only a plain attempts-left counter. Damage, healing, retries, and streaks are tracked in the background and included in shared results rather than displayed during play. Statistics aggregate **all attempts that day**:

- **Damage Taken:** actual HP lost, including direct contact and subsequent KR decay. Damage is capped at the HP actually available, and delayed damage is counted when HP drops.
- **Damage Healed:** HP actually restored by food, excluding overheal and HP clamps. Food and damage in the same native frame are observed separately.
- **Retries:** attempts after the first; a win on attempt N records N − 1 retries.

Share results copies directly to the clipboard and shows “Results copied to your clipboard.” for 2.2 seconds. There is no preview or share dialog. A first-try win uses this four-line format:

```text
Daily Sans · Streak 1
🟩🟩🟩🟩🟩🟩  6/6 left
123 Damage Taken · 123 Damage Healed
daily-sans.github.io
```

In shared results, green squares mean tries remaining and dark grey squares (`⬛`) mean failed or unfinished fights. One failure followed by a win gives `⬛🟩🟩🟩🟩🟩  5/6 left`. The fight page uses plain text without emoji. The final domain is the requested share text, not an assertion that the site has been deployed there.

## Upstream integration

- [Jcw87 source project](https://github.com/Jcw87/c2-sans-fight): Construct 2 source and event sheets.
- [Browser export](https://github.com/Jcw87/c2-sans-fight/tree/gh-pages), pinned to `a1732fcddc0487e47ec8d903bcb0049a627e69c7`.
- `public/vendor/c2-sans-fight/c2runtime.js`, 23 attack CSVs, upstream images and audio remain byte-identical to upstream. `sans_intro.csv` customizes only the pre-fight transition; its combat portion remains byte-identical.
- `data.js` retains only Normal mode, removes internal returns to MainMenu, adds the original small-bubble animation and original gesture frames, and delegates corrected character motion to the bridge; the daily application owns attempt lifecycle.
- Upstream HTML launchers, analytics, and offline worker/cache files are removed. `vendor/c2-sans-fight/daily.html` is the sole production fight entry and requires an active attempt in the parent application.
- `reference/c2-sans-fight.json` records original upstream hashes. `reference/simulator-customization.json` records customized data, intro hashes and removed files. `src/daily/intro-assets.json` records the opening assets' source archive, glyph metrics and hashes.

To repeat the import, download the [pinned ZIP](https://codeload.github.com/Jcw87/c2-sans-fight/zip/a1732fcddc0487e47ec8d903bcb0049a627e69c7), then run:

```sh
npm run import:simulator -- /path/to/downloaded.zip
```

The importer verifies the archive and then runs `scripts/configure-simulator.py`. It does not restore alternate modes to the final output.

The opening bubble, font and birds audio are included in `public/daily-assets/`; a full game installation is not needed to run the app. To regenerate them from an optional local Steam asset import, run `npm run import:undertale`, then `python3 scripts/import-intro-assets.py` and `python3 scripts/configure-simulator.py`.

The 19 original gesture/leg frames are also included. Regenerate their metadata and native pose table with `python3 scripts/import-animation-assets.py` after the optional Steam import, then run `python3 scripts/configure-simulator.py`.

The daily bridge wraps the pinned runtime’s Function action dispatch and HP variable. Bindings are verified against the serialized event graph; an upstream runtime update requires a fresh binding audit. No minified runtime edits or replacement combat engine are used.

Bad Time Simulator is by **Jcw87**. UNDERTALE and its original game assets are by **Toby Fox**. Attribution is visible in the application. The [upstream reuse statement](https://github.com/Jcw87/c2-sans-fight/issues/81) is retained in provenance.

## Verification and limits

Tests cover daily quotas across serialization, duplicate/late messages, completion, UTC date boundaries, streaks, exact sharing output, actual HP accounting, dialogue stage selection, native text controls, runtime field bindings, and removal of alternate modes. The preserved experimental engine and Steam importer also retain their tests.

With Vite running, `/tests/browser/speech-audio.html` runs the actual speech player in an OfflineAudioContext against the unchanged voice sample. It compares restart/stop waveform jumps with abrupt cutoffs, checks that playback ends in silence and verifies there is no clipping. It also renders the birds and verifies silence beginning exactly at their scheduled cutoff. This browser check reports `passed: true`; it is separate from `npm test`. Aside also verifies that Esc works from both the canvas and toolbar, holding Esc does not repeatedly toggle pause, the overlay's Resume button works, dialogue stops advancing while paused, and cancelling End attempt resumes play.

Aside browser QA includes the opening's transition to the small, silent bubble with the heart visible and eyeless expression, plus a trace of the native victory speech confirming no repeated character triggers while the completed page waits for input. A controlled first-try win preserves `6/6`; direct clipboard copying shows a temporary toast without opening a dialog. Six failed fights exhaust the day through the UI and remain exhausted after reload. Earlier QA covered a real opening loss with 92 damage, capped food recovery, dialogue progress after food, concurrent app contexts, and rejection of a game-frame reload. Controlled fixtures validate the integration and are not legal full-fight clears. Full original-game parity, an audible mixing comparison, and a complete matching-input original-game clear remain unverified. The simulator’s [documented hitbox/platform differences](https://github.com/Jcw87/c2-sans-fight#known-issues) and abbreviated ending remain.

The previous TypeScript engine remains under `src/fight/` for reference and tests, but it has no published entry point. Its older notes are in [docs/EXPERIMENTAL.md](docs/EXPERIMENTAL.md) and [docs/PARITY.md](docs/PARITY.md). The original asset importer is optional and not required to run the daily simulator.
