import './style.css';
import { ENCOUNTER, PHASES } from './game/encounter';
import { Simulation } from './game/simulation';
import { FightScene } from './game/scene';
import { Controls } from './game/input';
import { AudioEffects } from './game/audio';
import { loadStats, recordResult, saveStats } from './storage';

const heart = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1 2h5v2h4V2h5v8h-2v2h-2v2H9v2H7v-2H5v-2H3v-2H1z"/></svg>';
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.6"/></svg>';
const soundOn = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const soundOff = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6v12M15 6v12" stroke="currentColor" stroke-width="2"/></svg>';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="./" aria-label="Daily Sans home">${heart}<span>daily<span class="wordmark-light">sans</span><span class="wordmark-dot">.</span></span></a>
      <div class="header-right"><span class="edition">A LITTLE DETERMINATION, DAILY.</span><button class="text-button" id="help-button">How to play <span aria-hidden="true">↗</span></button></div>
    </header>

    <main>
      <section class="intro" aria-labelledby="page-title">
        <div><p class="eyebrow"><span class="status-dot"></span> THE PRACTICE ROOM <span class="eyebrow-slash">/</span> ENCOUNTER 001</p><h1 id="page-title">you're gonna have<br>a <span>bad time.</span></h1></div>
        <div class="intro-note"><span class="note-star">✳</span><p>Some days take a little more<br>determination than others.</p><span class="handwritten">let's make this one count.</span></div>
      </section>

      <div class="play-layout">
        <section class="fight-card" aria-labelledby="encounter-title">
          <div class="fight-topbar"><div class="encounter-name"><span class="tiny-square"></span><h2 id="encounter-title">The first encounter</h2><span class="practice-badge">PRACTICE</span></div><div class="game-tools"><button class="icon-button" id="sound-button" aria-label="Mute sound" aria-pressed="false" title="Mute sound">${soundOn}</button><span class="tool-divider"></span><button class="icon-button" id="pause-button" aria-label="Pause encounter" title="Pause (Esc)" disabled>${pauseIcon}</button></div></div>

          <div class="stage" id="stage">
            <div id="game"></div>
            <div class="stage-corner corner-tl"></div><div class="stage-corner corner-tr"></div>
            <span class="stage-number">01 / 03</span><span class="stage-label">LV 01 · STILL DETERMINED</span>
            <div class="game-overlay" id="game-overlay">
              <div class="overlay-panel" id="overlay-panel">
                <p class="overlay-eyebrow" id="overlay-eyebrow">42 SECONDS. KEEP YOUR HEART IN ONE PIECE.</p>
                <h3 id="overlay-title">ready when you are.</h3>
                <p id="overlay-description">Dodge the bones. Mind the blue soul.<br>Try again as many times as it takes.</p>
                <div class="result-stats" id="result-stats" hidden></div>
                <button class="primary-button" id="start-button"><span>Let's do this</span>${arrow}</button>
                <span class="keyboard-hint" id="keyboard-hint">or press <kbd>ENTER</kbd></span>
              </div>
            </div>
            <div class="pause-overlay" id="pause-overlay" hidden><p class="overlay-eyebrow">TAKE A BREATHER</p><h3>still here.</h3><p>The encounter is paused.</p><button class="primary-button" id="resume-button">Keep going ${arrow}</button><span class="keyboard-hint">or press <kbd>ESC</kbd></span></div>
          </div>

          <div class="hud"><div class="health-section"><span class="hud-heart">${heart}</span><div class="health-label"><span>HP</span><strong id="health-value">92 <span>/ 92</span></strong></div><div class="health-track" role="progressbar" aria-label="Health" aria-valuemin="0" aria-valuemax="92" aria-valuenow="92"><div id="health-fill"></div></div></div><div class="timer-section"><span class="timer-label" id="timer-label">SURVIVE</span><strong id="timer-value">00:42</strong><span class="timer-total">/ 00:42</span></div></div>
          <div class="encounter-progress" aria-hidden="true"><div id="encounter-progress-fill"></div></div>
          <div class="fight-bottom"><span class="live-indicator" id="fight-status"><span></span> READY FOR ANOTHER TRY?</span><button class="text-button" id="retry-button">${'<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 7a6 6 0 1 1 0 6M4 3v4h4" stroke="currentColor" stroke-width="1.3"/></svg>'} Restart <kbd>R</kbd></button></div>
          <div class="mobile-controls" aria-label="Touch controls"><div class="touch-dpad"><button data-direction="up" aria-label="Move up or jump">↑</button><button data-direction="left" aria-label="Move left">←</button><button data-direction="down" aria-label="Move down">↓</button><button data-direction="right" aria-label="Move right">→</button></div><p>Blue heart?<br>Hold ↑ to jump higher.</p></div>
        </section>

        <aside class="sidebar">
          <section class="briefing" aria-labelledby="briefing-title"><p class="eyebrow">YOUR OBJECTIVE</p><h2 id="briefing-title">stay determined.</h2><p class="body-copy">One short encounter.<br>Three little surprises.<br>As many tries as you need.</p><div class="objective-rule"></div><div class="objective-meta"><span>ENCOUNTER LENGTH</span><strong>42 seconds</strong></div><div class="objective-meta"><span>ATTEMPT LIMIT</span><strong>None. Keep going.</strong></div></section>

          <section class="pattern-section" aria-labelledby="pattern-title"><h2 class="eyebrow" id="pattern-title">THE PATTERNS</h2><ol class="phase-list">${PHASES.map((phase, index) => `<li data-phase="${index}" class="phase-row${index === 0 ? ' current' : ''}"><span class="phase-index">0${index + 1}</span><div><h3>${phase.name}</h3><p>${index === 0 ? 'Find the gaps. Move freely.' : index === 1 ? 'Gravity has other plans.' : 'Watch where the light goes.'}</p></div><span class="phase-marker" aria-hidden="true">${index === 0 ? '↗' : '·'}</span></li>`).join('')}</ol></section>

          <section class="session-section" aria-labelledby="session-title"><div class="session-heading"><h2 class="eyebrow" id="session-title">YOUR PROGRESS</h2><span>ON THIS DEVICE</span></div><div class="session-stats"><div><strong id="attempt-count">00</strong><span>ATTEMPTS</span></div><div><strong id="clear-count">00</strong><span>CLEARS</span></div><div><strong id="best-time">—</strong><span>BEST SURVIVAL</span></div></div><p class="storage-note" id="storage-note" hidden>Storage is unavailable. Progress lasts for this session.</p></section>

          <p class="margin-note"><span>*</span> dying is part of the process.<br><span class="note-indent">you've got this.</span></p>
        </aside>
      </div>

      <section class="controls-strip" aria-label="Game controls"><div class="control-group"><span class="control-heading">THE BASICS</span><span class="key-cluster"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span><span>Move <span class="control-alternative">/ WASD</span></span></div><span class="control-separator"></span><div class="control-group"><kbd>↑</kbd><span>Jump when blue <span class="control-alternative">/ SPACE</span></span></div><span class="control-separator"></span><div class="control-group"><kbd>ESC</kbd><span>Take a break</span></div><button class="text-button controls-help" id="controls-help-button">All controls ${arrow}</button></section>
      <p class="phase-hint" id="phase-hint" role="status" aria-live="polite">${heart}<span>No rush. Every retry is a fresh start.</span></p>
    </main>

    <footer><span>A small daily ritual. A very bad time.</span><span>An unofficial fan-made prototype. Inspired by <a href="https://undertale.com/" target="_blank" rel="noopener noreferrer">UNDERTALE <span aria-hidden="true">↗</span></a></span></footer>
  </div>

  <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-topline"><span class="eyebrow">A FEW FRIENDLY POINTERS</span><button class="icon-button" id="close-help-button" aria-label="Close instructions">×</button></div><h2 id="help-title">keep your heart<br>in the game.</h2><p>Survive all 42 seconds to clear this practice encounter. The same attacks play on every attempt, so you can learn the patterns.</p><div class="help-rule"><span class="soul-dot red"></span><div><strong>Red soul</strong><p>Move freely with the arrow keys or WASD. Slip through the gaps between the bones.</p></div></div><div class="help-rule"><span class="soul-dot blue"></span><div><strong>Blue soul</strong><p>Gravity pulls you down. Tap ↑, W, or Space to jump. Hold to jump higher, then release for a shorter jump. Release before jumping again.</p></div></div><div class="help-rule"><span class="soul-dot orange"></span><div><strong>Watch the warning</strong><p>Orange lanes show where a blaster will fire. Leave the lane before it turns white.</p></div></div><div class="help-shortcuts"><span><kbd>ESC</kbd> / <kbd>P</kbd> Pause</span><span><kbd>R</kbd> Restart</span><span><kbd>ENTER</kbd> Start or retry</span></div><p class="help-footnote">This is a short practice encounter with simplified damage, original placeholder art, and synthesized effects. Daily challenges and sharing come later.</p><button class="primary-button" id="got-it-button">Got it. Let's go. ${arrow}</button></dialog>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }

const simulation = new Simulation();
const audio = new AudioEffects();
let stats = loadStats();
let paused = false;
let finished = false;
let lastPhase = -1;
let lastHits = 0;
let beamIds = new Set<number>();
let previousStatus = simulation.status;
let autoResumeAfterHelp = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const help = element<HTMLDialogElement>('help-dialog');
const controls = new Controls((action) => {
  if (help.open) return;
  if (action === 'pause') togglePause();
  else if (action === 'retry') start();
  else if (paused) togglePause();
  else if (simulation.status === 'ready' || simulation.status === 'won' || simulation.status === 'lost') start();
});

function persist(): void { element('storage-note').hidden = saveStats(stats); }

function renderStats(): void {
  element('attempt-count').textContent = String(stats.attempts).padStart(2, '0');
  element('clear-count').textContent = String(stats.clears).padStart(2, '0');
  element('best-time').textContent = stats.bestSeconds > 0 ? `${stats.bestSeconds.toFixed(1)}s` : '—';
}

function renderPhase(phaseIndex: number): void {
  document.querySelectorAll<HTMLElement>('[data-phase]').forEach((row, index) => {
    row.classList.toggle('current', index === phaseIndex);
    row.classList.toggle('complete', index < phaseIndex);
    row.querySelector('.phase-marker')!.textContent = index < phaseIndex ? '✓' : index === phaseIndex ? '↗' : '·';
  });
  document.querySelector('.stage-number')!.textContent = `0${phaseIndex + 1} / 03`;
}

function start(): void {
  audio.unlock();
  audio.play('start');
  simulation.start();
  controls.clear();
  controls.active = true;
  paused = false;
  finished = false;
  lastPhase = -1;
  lastHits = 0;
  beamIds = new Set();
  renderPhase(0);
  stats.attempts++;
  persist();
  renderStats();
  element('game-overlay').hidden = true;
  element('pause-overlay').hidden = true;
  element<HTMLButtonElement>('pause-button').disabled = false;
  element('pause-button').setAttribute('aria-label', 'Pause encounter');
  element('pause-button').setAttribute('title', 'Pause (Esc)');
  element('stage').classList.add('is-playing');
  element('stage').classList.remove('is-finished');
  element('phase-hint').innerHTML = `${heart}<span>Get ready. Find the gaps and keep moving.</span>`;
  // Keep Space from activating the last clicked button during the encounter.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function togglePause(force?: boolean): void {
  if (simulation.status !== 'playing' && simulation.status !== 'countdown') return;
  paused = force ?? !paused;
  controls.clear();
  element('pause-overlay').hidden = !paused;
  element('pause-button').setAttribute('aria-label', paused ? 'Resume encounter' : 'Pause encounter');
  element('pause-button').setAttribute('title', paused ? 'Resume (Esc)' : 'Pause (Esc)');
  element('fight-status').innerHTML = `<span></span> ${paused ? 'TAKE YOUR TIME. WE’LL WAIT.' : 'STAY DETERMINED.'}`;
  if (paused) element<HTMLButtonElement>('resume-button').focus({ preventScroll: true });
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function finish(): void {
  finished = true;
  controls.active = false;
  const result = simulation.result();
  stats = recordResult(stats, result);
  persist();
  renderStats();
  audio.play(result.won ? 'won' : 'lost');
  element('game-overlay').hidden = false;
  element('stage').classList.remove('is-playing');
  element('stage').classList.add('is-finished');
  element('overlay-eyebrow').textContent = result.won ? 'ENCOUNTER CLEARED' : 'THAT’S ANOTHER THING YOU’VE LEARNED.';
  element('overlay-title').textContent = result.won ? 'you stayed determined.' : 'stay determined.';
  element('overlay-description').textContent = result.won ? 'A little battered. Still in one piece. Nicely done.' : `You made it ${result.seconds.toFixed(1)} seconds. Take a breath. Try again.`;
  element('result-stats').hidden = false;
  element('result-stats').innerHTML = `<div><strong>${Math.round(result.seconds / ENCOUNTER.duration * 100)}%</strong><span>SURVIVED</span></div><div><strong>${result.hits}</strong><span>HITS TAKEN</span></div><div><strong>${result.health}</strong><span>HP LEFT</span></div>`;
  element('start-button').innerHTML = `<span>${result.won ? 'Go again' : 'One more try'}</span>${arrow}`;
  element('keyboard-hint').innerHTML = 'or press <kbd>ENTER</kbd> / <kbd>R</kbd>';
  element<HTMLButtonElement>('pause-button').disabled = true;
  element('fight-status').innerHTML = `<span></span> ${result.won ? 'A LITTLE DETERMINATION GOES A LONG WAY.' : 'EVERY TRY GETS YOU CLOSER.'}`;
  element('phase-hint').innerHTML = `${heart}<span>${result.won ? `Encounter cleared on attempt ${stats.attempts}. Your next try is waiting.` : `Furthest pattern: ${result.phase}. The same sequence awaits your next try.`}</span>`;
  element<HTMLButtonElement>('start-button').focus({ preventScroll: true });
}

function renderHud(): void {
  element('health-value').innerHTML = `${simulation.health} <span>/ ${ENCOUNTER.health}</span>`;
  element('health-fill').style.width = `${simulation.health / ENCOUNTER.health * 100}%`;
  element('health-fill').classList.toggle('low', simulation.health < 28);
  document.querySelector('.health-track')!.setAttribute('aria-valuenow', String(simulation.health));
  element('timer-value').textContent = `00:${String(Math.max(0, Math.ceil(ENCOUNTER.duration - simulation.time))).padStart(2, '0')}`;
  element('encounter-progress-fill').style.width = `${simulation.time / ENCOUNTER.duration * 100}%`;
}

const scene = new FightScene(simulation, (delta) => {
  if (document.hidden || paused || help.open) return;
  // Long stalls require an explicit resume instead of fast-forwarding into an attack.
  if (delta > 0.3 && (simulation.status === 'playing' || simulation.status === 'countdown')) {
    togglePause(true);
    return;
  }
  simulation.advance(delta, controls.read());
  if (simulation.status === 'playing') {
    const phaseIndex = PHASES.findIndex((phase) => phase.id === simulation.phase.id);
    if (phaseIndex !== lastPhase) {
      if (lastPhase >= 0) audio.play('phase');
      lastPhase = phaseIndex;
      renderPhase(phaseIndex);
      element('phase-hint').innerHTML = `${heart}<span>${simulation.phase.hint}</span>`;
    }
    if (simulation.hits > lastHits) {
      lastHits = simulation.hits;
      audio.play('hit');
      if (!reducedMotion) {
        element('stage').classList.remove('hit');
        void element('stage').offsetWidth;
        element('stage').classList.add('hit');
      }
    }
    for (const beam of simulation.beams) {
      if (simulation.time >= beam.firesAt && !beamIds.has(beam.id)) {
        audio.play('beam');
        beamIds.add(beam.id);
      }
    }
  }
  if (simulation.status !== previousStatus) {
    previousStatus = simulation.status;
    if (simulation.status === 'playing') element('fight-status').innerHTML = '<span></span> STAY DETERMINED.';
    if (simulation.status === 'countdown') element('fight-status').innerHTML = '<span></span> HERE WE GO.';
  }
  renderHud();
  if (!finished && (simulation.status === 'won' || simulation.status === 'lost')) finish();
}, element('game'));

element('start-button').addEventListener('click', start);
element('retry-button').addEventListener('click', start);
element('pause-button').addEventListener('click', () => togglePause());
element('resume-button').addEventListener('click', () => togglePause());
element('sound-button').addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  const button = element('sound-button');
  button.innerHTML = audio.enabled ? soundOn : soundOff;
  button.setAttribute('aria-label', audio.enabled ? 'Mute sound' : 'Enable sound');
  button.setAttribute('title', audio.enabled ? 'Mute sound' : 'Enable sound');
  button.setAttribute('aria-pressed', String(!audio.enabled));
  if (audio.enabled) { audio.unlock(); audio.play('start'); }
});

function openHelp(): void {
  autoResumeAfterHelp = !paused && (simulation.status === 'playing' || simulation.status === 'countdown');
  if (autoResumeAfterHelp) togglePause(true);
  controls.clear();
  help.showModal();
}
element('help-button').addEventListener('click', openHelp);
element('controls-help-button').addEventListener('click', openHelp);
element('close-help-button').addEventListener('click', () => help.close());
element('got-it-button').addEventListener('click', () => help.close());
help.addEventListener('click', (event) => { if (event.target === help) help.close(); });
help.addEventListener('close', () => {
  controls.clear();
  if (autoResumeAfterHelp) togglePause(false);
  autoResumeAfterHelp = false;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
window.addEventListener('blur', () => togglePause(true));
renderStats();

if (import.meta.hot) import.meta.hot.dispose(() => scene.destroy());
