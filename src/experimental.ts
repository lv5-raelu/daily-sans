import './style.css';
import { Assets } from './fight/assets';
import { Battle } from './fight/battle';
import { FightAudio } from './fight/audio';
import { Renderer } from './fight/renderer';
import { EMPTY_INPUT, type Input } from './fight/physics';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header><h1>daily sans</h1><span>Fight recreation · in development</span></header>
    <div class="screen"><canvas id="battle" width="640" height="480" tabindex="0" aria-label="Sans fight. Arrow keys move. Z or Enter confirms; X cancels; Shift slows movement." aria-describedby="controls"></canvas><p id="loading" role="status">Loading sprites…</p></div>
    <div class="toolbar"><button id="start" disabled>Begin fight</button><button id="pause" disabled>Pause</button><button id="sound" aria-pressed="false">Sound on</button><button id="fullscreen">Fullscreen</button><label><input id="skip" type="checkbox"> Skip opening dialogue</label></div>
    <p id="controls">↑ ↓ ← → Move / jump <span>·</span> Z / Enter Confirm <span>·</span> X Cancel <span>·</span> Shift Slow <span>·</span> Esc Pause <span>·</span> R Restart</p>
    <div class="touch-controls" aria-label="Touch controls"><div class="dpad"><button data-key="ArrowUp" aria-label="Up or jump">↑</button><button data-key="ArrowLeft" aria-label="Left">←</button><button data-key="ArrowDown" aria-label="Down">↓</button><button data-key="ArrowRight" aria-label="Right">→</button></div><div class="actions"><button data-action="cancel" aria-label="Cancel">X</button><button data-action="confirm" aria-label="Confirm">Z</button></div></div>
    <p class="sr-only" id="game-status" role="status" aria-live="polite"></p>
    <footer><span>Unofficial UNDERTALE fan project. Game and original assets © Toby Fox.</span><a href="https://github.com/Jcw87/c2-sans-fight" target="_blank" rel="noopener noreferrer">Attack reference: Jcw87</a></footer>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#battle')!;
const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;
const soundButton = document.querySelector<HTMLButtonElement>('#sound')!;
const skip = document.querySelector<HTMLInputElement>('#skip')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const status = document.querySelector<HTMLElement>('#game-status')!;
const assets = new Assets();
const battle = new Battle();
const audio = new FightAudio();
let renderer: Renderer;
let ready = false, paused = false;
const keys = new Set<string>();
let lastMode = '';
let lastTime = performance.now();

function clearInput(): void { keys.clear(); document.querySelectorAll('.pressed').forEach(e => e.classList.remove('pressed')); }
function focus(): void { canvas.focus({ preventScroll: true }); }
function restart(): void { if (!ready) return; clearInput(); audio.stop(); void audio.unlock(); paused = false; audio.pause(false); battle.start(skip.checked); syncUI(); focus(); }
function confirm(): void { if (!ready) return; void audio.unlock(); if (paused) togglePause(); else if (['ready', 'dead', 'won'].includes(battle.mode)) restart(); else battle.confirm(); }
function cancel(): void { if (battle.mode === 'dialogue') battle.revealText(); else battle.cancel(); }
function togglePause(force?: boolean): void {
  if (!ready || ['ready', 'dead', 'won'].includes(battle.mode)) return;
  paused = force ?? !paused; audio.pause(paused); clearInput(); syncUI();
}
function syncUI(): void {
  startButton.textContent = battle.mode === 'ready' ? 'Begin fight' : 'Restart';
  pauseButton.disabled = ['ready', 'dead', 'won'].includes(battle.mode);
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  if (lastMode !== battle.mode) {
    status.textContent = battle.mode === 'attack' ? `Enemy attack. ${battle.health.hp} HP.` : battle.mode === 'menu' ? 'Your turn. Fight, Act, Item, or Mercy.' : battle.mode === 'dead' ? 'Game over. Z or Enter to retry.' : battle.mode === 'won' ? 'Fight complete.' : battle.mode === 'dialogue' ? `${battle.speaker === 'sans' ? 'Sans is speaking.' : battle.text} Z or Enter to continue.` : '';
    lastMode = battle.mode;
  }
}
startButton.addEventListener('click', restart);
pauseButton.addEventListener('click', () => { togglePause(); focus(); });
soundButton.addEventListener('click', () => { void audio.unlock(); audio.mute(!audio.muted); soundButton.textContent = audio.muted ? 'Sound off' : 'Sound on'; soundButton.setAttribute('aria-pressed', String(audio.muted)); focus(); });
document.querySelector('#fullscreen')!.addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.querySelector('.screen')!.requestFullscreen().catch(() => {}); focus(); });

const usedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'z', 'Z', 'x', 'X', 'Enter', 'Shift', 'Escape', 'r', 'R'];
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement && ['Enter', ' '].includes(e.key)) return;
  if (!usedKeys.includes(e.key)) return;
  e.preventDefault();
  keys.add(e.key);
  if (e.repeat) return;
  if (['z', 'Z', 'Enter'].includes(e.key)) confirm();
  else if (['x', 'X'].includes(e.key)) cancel();
  else if (e.key === 'Escape') togglePause();
  else if (e.key.toLowerCase() === 'r') restart();
  else if (!paused) battle.navigate(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0);
});
window.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('blur', () => { clearInput(); togglePause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); togglePause(true); } });

document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
  const key = button.dataset.key!;
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); keys.add(key); button.classList.add('pressed'); battle.navigate(key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0, key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0); });
  const release = () => { keys.delete(key); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
document.querySelector('[data-action="confirm"]')!.addEventListener('click', confirm);
const touchCancel = document.querySelector<HTMLButtonElement>('[data-action="cancel"]')!;
touchCancel.addEventListener('click', cancel);
touchCancel.addEventListener('pointerdown', e => { touchCancel.setPointerCapture(e.pointerId); keys.add('x'); });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) touchCancel.addEventListener(event, () => keys.delete('x'));

function frame(time: number): void {
  const elapsed = (time - lastTime) / 1000; lastTime = time;
  if (ready) {
    if (elapsed > 0.5) togglePause(true);
    if (!paused) {
      const input: Input = { ...EMPTY_INPUT, left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), up: keys.has('ArrowUp'), down: keys.has('ArrowDown'), slow: keys.has('Shift') || keys.has('x') || keys.has('X') };
      battle.advance(Math.min(elapsed, 0.1), input);
    }
    for (const event of battle.eventQueue.splice(0)) audio.play(event.sound, event.rate);
    renderer.draw(battle, paused); syncUI();
  }
  requestAnimationFrame(frame);
}
assets.load().then(() => { audio.configure(assets.original?.pack); battle.originalDialogue = assets.original?.pack.dialogue; battle.originalTextStyles = assets.original?.pack.textStyles; renderer = new Renderer(canvas, assets); ready = true; loading.hidden = true; startButton.disabled = false; syncUI(); renderer.draw(battle, false); }).catch(error => { loading.textContent = 'Sprites could not load. Reload to try again.'; console.error(error); });
requestAnimationFrame(frame);
