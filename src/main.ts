import './simulator.css';
import { CHANNEL, isFightEvent } from './daily/protocol';
import { ATTEMPT_LIMIT, begin, dayResult, emptyHistory, left, parseHistory, shareText, STORAGE_KEY, update, utcDay, won, type History } from './daily/state';

const PRACTICE_URL = 'https://jcw87.github.io/c2-sans-fight/';
const gameUrl = `${import.meta.env.BASE_URL}vendor/c2-sans-fight/daily.html`;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header><h1>daily sans</h1><span id="date"></span><span id="remaining" aria-label="Daily attempts remaining"></span></header>
    <div class="screen" id="screen">
      <div class="welcome" id="welcome">
        <p id="headline">you feel like you're going to<br>have a bad time.</p>
        <p id="explanation" hidden></p>
        <button id="start" type="button">Begin daily fight</button>
        <a id="practice-end" href="${PRACTICE_URL}" target="_blank" rel="noopener noreferrer" hidden>Practice in Bad Time Simulator ↗</a>
      </div>
      <div id="pause-screen" class="pause-screen" role="group" aria-labelledby="pause-title" hidden>
        <h2 id="pause-title">paused</h2>
        <button id="resume" type="button">Resume fight</button>
        <p>Press Esc to resume</p>
      </div>
    </div>
    <div class="toolbar">
      <button id="pause" type="button" disabled>Pause</button>
      <button id="abandon" type="button" disabled>End attempt</button>
      <button id="fullscreen" type="button">Fullscreen</button>
      <button id="share" type="button">Share results</button>
    </div>
    <p id="controls">Arrow keys move / jump · Z confirms · X cancels / reveals dialogue · Esc pauses / resumes</p>
    <p id="status" role="status" aria-live="polite">Loading today’s results…</p>
    <div class="day-note"><span id="reset"></span><a href="${PRACTICE_URL}" target="_blank" rel="noopener noreferrer">Practice ↗</a></div>
    <footer><span>Unofficial UNDERTALE fan project. Game and original assets © Toby Fox.</span><a href="https://github.com/Jcw87/c2-sans-fight" target="_blank" rel="noopener noreferrer">Simulator by Jcw87</a></footer>
    <div id="toast" role="status" aria-live="polite" hidden></div>
    <dialog id="end-dialog" aria-labelledby="end-title">
      <h2 id="end-title">End this attempt?</h2>
      <p>This attempt stays used. You can try again if you have attempts left today.</p>
      <div class="dialog-actions"><button id="keep-playing" type="button">Keep playing</button><button id="confirm-end" type="button">End attempt</button></div>
    </dialog>
  </main>`;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const start = $<HTMLButtonElement>('start');
const pause = $<HTMLButtonElement>('pause');
const abandon = $<HTMLButtonElement>('abandon');
const endDialog = $<HTMLDialogElement>('end-dialog');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let history: History = emptyHistory();
let today = utcDay();
let current: { id: string; day: string } | undefined;
let frame: HTMLIFrameElement | undefined;
let releaseFight: (() => void) | undefined;
let paused = false, ready = false, fatal = false, starting = false, recovering = false;
let notice = '';

function read(): History { return parseHistory(localStorage.getItem(STORAGE_KEY)); }
async function mutate(fn: (next: History) => void): Promise<void> {
  await navigator.locks.request('daily-sans-store', () => {
    const next = read(); fn(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    history = next;
  });
}
function render(): void {
  const result = dayResult(history, today);
  const remaining = left(result), complete = won(result), active = result.attempts.some(a => a.outcome === 'active');
  $('date').textContent = new Date(`${today}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  $('remaining').textContent = `${remaining}/${ATTEMPT_LIMIT} attempts left`;
  $('welcome').hidden = !!current;
  start.hidden = complete || remaining === 0;
  start.disabled = !ready || fatal || starting || active;
  start.textContent = result.attempts.length ? 'Retry daily fight' : 'Begin daily fight';
  pause.disabled = !current || fatal; pause.textContent = paused ? 'Resume' : 'Pause';
  $('pause-screen').hidden = !current || !paused;
  $<HTMLButtonElement>('resume').disabled = fatal;
  abandon.disabled = !current || fatal;
  $('practice-end').hidden = !complete && remaining !== 0;
  if (complete) {
    $('headline').textContent = 'fight complete.';
    $('explanation').textContent = 'Come back tomorrow.';
  } else if (remaining === 0) {
    $('headline').textContent = 'no attempts left.';
    $('explanation').textContent = 'No daily attempts left. Keep practicing with Jcw87’s simulator.';
  } else if (active && !current) {
    $('headline').textContent = 'a fight is already in progress.';
    $('explanation').textContent = 'Continue in your other Daily Sans tab.';
  } else {
    $('headline').innerHTML = "you feel like you're going to<br>have a bad time.";
    $('explanation').textContent = '';
  }
  $('explanation').hidden = !$('explanation').textContent;
  $('status').textContent = notice || (current ? paused ? 'Paused. Resume when you’re ready.' : 'Daily fight in progress.' : complete ? 'Daily fight complete. Share your result.' : remaining === 0 ? 'Daily limit reached. The practice link has unlimited attempts.' : active ? 'One daily fight can run at a time.' : 'Failed or unfinished fights use one try. A win keeps your remaining tries.');
  updateClock();
}
function updateClock(): void {
  const seconds = Math.max(0, Math.ceil((Date.parse(`${today}T00:00:00Z`) + 86400000 - Date.now()) / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  $('reset').textContent = `Next fight in ${[h, m, s].map(n => String(n).padStart(2, '0')).join(':')} · resets at 00:00 UTC`;
}
function send(kind: 'pause' | 'resume' | 'stop'): void {
  if (current) frame?.contentWindow?.postMessage({ channel: CHANNEL, attemptId: current.id, kind }, location.origin);
}
function setPaused(value: boolean): void {
  if (!current || fatal || (!value && endDialog.open)) return;
  paused = value; send(paused ? 'pause' : 'resume'); render();
  if (!paused) frame?.focus();
}
function removeFight(): void {
  send('stop'); frame?.remove(); frame = undefined; current = undefined; paused = false;
  releaseFight?.(); releaseFight = undefined;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}
function error(error: unknown): void {
  fatal = true;
  send('pause');
  notice = error instanceof Error ? error.message : 'Today’s results could not be saved. Reload to try again.';
  render();
}
async function recover(): Promise<void> {
  await navigator.locks.request('daily-sans-fight', { ifAvailable: true }, async lock => {
    if (!lock) { history = read(); return; }
    await mutate(next => {
      for (const result of Object.values(next.days)) for (const attempt of result.attempts)
        if (attempt.outcome === 'active') attempt.outcome = 'abandoned';
    });
  });
}
start.addEventListener('click', () => {
  if (starting || current || fatal || !ready) return;
  starting = true; notice = ''; render();
  void navigator.locks.request('daily-sans-fight', { ifAvailable: true }, async lock => {
    if (!lock) { notice = 'A daily fight is already open in another tab.'; return; }
    const id = crypto.randomUUID(); const day = utcDay();
    await mutate(next => { begin(next, day, id, new Date().toISOString()); });
    today = day; current = { id, day }; paused = false;
    frame = document.createElement('iframe'); frame.id = 'simulator';
    frame.title = 'Daily Sans fight. Arrow keys move, Z confirms, X cancels.';
    frame.allow = 'autoplay; fullscreen'; frame.allowFullscreen = true;
    frame.setAttribute('aria-describedby', 'controls');
    frame.src = `${gameUrl}?attempt=${encodeURIComponent(id)}`;
    $('screen').append(frame); frame.focus(); render();
    await new Promise<void>(resolve => { releaseFight = resolve; });
  }).catch(error).finally(() => { starting = false; render(); });
});
pause.addEventListener('click', () => setPaused(!paused));
$('resume').addEventListener('click', () => setPaused(false));
abandon.addEventListener('click', () => { setPaused(true); endDialog.showModal(); });
$('keep-playing').addEventListener('click', () => { endDialog.close(); setPaused(false); });
endDialog.addEventListener('cancel', event => { event.preventDefault(); endDialog.close(); setPaused(false); });
$('confirm-end').addEventListener('click', () => {
  endDialog.close();
  const attempt = current;
  if (!attempt) return;
  void mutate(next => {
    const saved = dayResult(next, attempt.day).attempts.find(a => a.id === attempt.id);
    if (saved) update(next, attempt.day, attempt.id, saved.damage, saved.healed, 'abandoned');
  }).then(() => { notice = 'Attempt ended.'; removeFight(); render(); }).catch(error);
});
window.addEventListener('message', event => {
  if (!current || event.origin !== location.origin || event.source !== frame?.contentWindow || !isFightEvent(event.data) || event.data.attemptId !== current.id) return;
  const message = event.data, attempt = { ...current };
  if (message.kind === 'ready') { if (paused) send('pause'); return; }
  if (message.kind === 'toggle-pause') { if (!endDialog.open) setPaused(!paused); return; }
  void mutate(next => {
    const outcome = message.kind === 'won' ? 'won' : message.kind === 'lost' ? 'lost' : message.kind === 'error' ? 'abandoned' : undefined;
    update(next, attempt.day, attempt.id, message.damage, message.healed, outcome);
  }).then(() => {
    if (!current || current.id !== attempt.id) return;
    if (message.kind === 'won' || message.kind === 'lost' || message.kind === 'error') {
      notice = message.kind === 'error' ? message.message || 'The fight could not continue.' : '';
      removeFight();
    }
    render();
  }).catch(error);
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('screen').requestFullscreen();
    frame?.focus();
  } catch { notice = 'Fullscreen is unavailable in this browser.'; render(); }
});
function toast(message: string): void {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2200);
}
$('share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareText(history, today)); toast('Results copied to your clipboard.'); }
  catch { toast('Could not copy results. Please try again.'); }
});
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { try { history = read(); render(); } catch (e) { error(e); } } });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
window.addEventListener('focus', () => {
  if (!current && !starting && ready && !fatal) void recover().then(render).catch(error);
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.repeat && current && !endDialog.open) {
    event.preventDefault(); setPaused(!paused);
  }
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && current) setPaused(true); });
setInterval(() => {
  updateClock();
  if (!current && !starting && !recovering && ready && !fatal && Object.values(history.days).some(d => d.attempts.some(a => a.outcome === 'active'))) {
    recovering = true;
    void recover().then(render).catch(error).finally(() => { recovering = false; });
  }
  if (utcDay() !== today) {
    const attempt = current;
    const rollover = attempt ? mutate(next => {
      const saved = dayResult(next, attempt.day).attempts.find(a => a.id === attempt.id);
      if (saved) update(next, attempt.day, attempt.id, saved.damage, saved.healed, 'abandoned');
    }) : Promise.resolve();
    void rollover.then(() => { removeFight(); today = utcDay(); notice = 'A new daily fight is ready.'; render(); }).catch(error);
  }
}, 1000);
async function initialize(): Promise<void> {
  if (!navigator.locks) throw new Error('Daily Sans needs a browser with Web Locks support to protect daily attempts.');
  const scope = new URL(`${import.meta.env.BASE_URL}vendor/c2-sans-fight/`, location.href);
  const registration = await navigator.serviceWorker?.getRegistration(scope.href);
  if (registration && registration.scope === scope.href) await registration.unregister();
  await recover(); ready = true; render();
}
void initialize().catch(error);
