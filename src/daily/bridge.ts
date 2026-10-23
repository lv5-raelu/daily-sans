import { afterOpening, DialogueProgress, finalDialogue, opening, openingThreat, poseAt, spareDialogue, type Page, type Pose } from './dialogue';
import { HealthCounter } from './health';
import { CHANNEL, type FightEvent } from './protocol';
import { parseHistory, STORAGE_KEY, utcDay } from './state';
import { RUNTIME_FIELDS as F } from './runtime-fields';
import { ThreatText } from './threat-text';
import { VoiceGate } from './voice';
import { SpeechAudio } from './speech-audio';
import { FACE_ANIMATIONS, GestureCadence, nativeBob, nativeDodgeOffset } from './animation';

interface Instance { hb: (number | string | boolean)[]; type: { name: string }; width: number; height: number; x: number; y: number; uid: number; visible: boolean; Wf: number }
type ActionFunction = (this: Instance, ...args: (number | string | (string | number)[])[]) => unknown;
interface Runtime {
  Vg: Record<string, { data: number }>;
  se: Record<string, { zb: ActionFunction }>;
  types: Record<string, { d: Instance[] }>;
}
interface Host extends Window {
  cr_createRuntime: (id: string) => void;
  cr_getC2Runtime: () => Runtime | null;
  cr_setSuspended: (paused: boolean) => void;
  c2_callFunction: (name: string, args?: (string | number)[]) => unknown;
  sc: { prototype: { e: { CallFunction: ActionFunction } } };
}
const host = window as unknown as Host;
const attemptId = new URLSearchParams(location.search).get('attempt') ?? '';
let counters = new HealthCounter(92, 92);
let finished = false;
const threatText = new ThreatText();
const speechAudio = new SpeechAudio();
const stopVoice = (): void => speechAudio.stop();
window.addEventListener('pagehide', () => speechAudio.dispose(), { once: true });
function send(kind: FightEvent['kind'], message?: string): void {
  parent.postMessage({ channel: CHANNEL, attemptId, kind, damage: counters.damage, healed: counters.healed, message } satisfies FightEvent, location.origin);
}
function finish(kind: 'lost' | 'won'): void {
  if (finished) return;
  finished = true;
  stopVoice(); speechAudio.stopOpening(); threatText.hide();
  send(kind);
  queueMicrotask(() => host.cr_setSuspended(true));
}
function fail(error: unknown): void {
  if (finished) return;
  finished = true;
  stopVoice(); speechAudio.stopOpening(); threatText.hide();
  host.cr_setSuspended?.(true);
  send('error', error instanceof Error ? error.message : 'The fight could not start.');
}
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.repeat || finished) return;
  event.preventDefault(); event.stopPropagation();
  send('toggle-pause');
}, { capture: true });

function install(runtime: Runtime): void {
  const hp = runtime.Vg['4067313995094888'];
  const maxHP = runtime.Vg['2742940924955148'];
  counters = new HealthCounter(hp.data, maxHP.data);
  let food = false, dead = false, queuedUpdate = false;
  let value = hp.data;
  Object.defineProperty(hp, 'data', {
    configurable: true, enumerable: true,
    get: () => value,
    set(next: number) {
      counters.change(next, food);
      value = next;
      if (!queuedUpdate) {
        queuedUpdate = true;
        queueMicrotask(() => { queuedUpdate = false; if (!finished) send('progress'); });
      }
      if (next <= 0 && !dead) {
        dead = true;
        // Let the simulator's split-heart/shatter animation finish first.
        setTimeout(() => finish('lost'), 4500);
      }
    },
  });

  const progress = new DialogueProgress();
  const gestures = new GestureCadence();
  let queue: Page[] = [], continuation: (() => void) | undefined;
  let page: Page | undefined;
  let lastPose: Pose | undefined;
  const usedPauses = new Set<number>();
  const call = (name: string, ...args: (string | number)[]): unknown => host.c2_callFunction(name, args);
  function applyPose(pose: Pose): void {
    const face = FACE_ANIMATIONS[pose.face];
    if (!face || ![0, 1].includes(pose.torso)) throw new Error('An original dialogue pose is unavailable.');
    if (lastPose?.face !== pose.face) call('SansHead', face);
    if (lastPose?.torso !== pose.torso) call('SansTorso', pose.torso === 1 ? 'Shrug' : 'Default');
    if (lastPose?.sweat !== pose.sweat) call('SansSweat', pose.sweat);
    lastPose = pose;
  }
  function updatePose(font: Instance): void {
    if (page && font.type.name === F.speech.type && font.hb[F.speech.fullText] === page.text)
      applyPose(poseAt(page, Number(font.hb[F.speech.currentChar])));
  }
  for (const sid of F.characterActions) {
    const action = runtime.se[sid], original = action.zb;
    action.zb = function (...args) { const result = original.apply(this, args); updatePose(this); return result; };
  }
  const bobTimer = runtime.se[F.bobTimerAction], addBobTime = bobTimer.zb;
  bobTimer.zb = function (...args) {
    const result = addBobTime.apply(this, args);
    const bob = nativeBob(String(runtime.Vg[F.animationVariable].data), Number(this.hb[0]));
    this.hb[1] = bob.torsoX; this.hb[2] = bob.torsoY;
    const head = runtime.types.t23.d[0];
    if (head) { head.hb[1] = bob.headX; head.hb[2] = bob.headY; }
    return result;
  };
  for (const [kind, sid] of Object.entries(F.dodgeActions)) {
    const action = runtime.se[sid], original = action.zb;
    action.zb = function (...args) {
      args[0] = 320 + (kind === 'hold' ? -102 : nativeDodgeOffset(Number(this.hb[F.sans.dodgeTimer]), kind === 'back'));
      return original.apply(this, args);
    };
  }
  const voiceGate = new VoiceGate();
  const playVoice = runtime.se[F.voicePlayAction];
  const originalPlay = playVoice.zb;
  playVoice.zb = function (...args) {
    if (String(args[1]).toLowerCase() !== 'sansspeak') return originalPlay.apply(this, args);
    if (finished) return;
    const font = runtime.types[F.speech.type].d.at(-1);
    if (font && !voiceGate.allow(font.uid, Number(font.hb[F.speech.currentChar]), String(font.hb[F.speech.fullText]))) return;
    speechAudio.play();
  };
  function nextPage(): void {
    if (finished) return;
    stopVoice(); threatText.hide();
    voiceGate.reset();
    page = queue.shift();
    usedPauses.clear();
    if (!page) { const done = continuation; continuation = undefined; call('TLResume'); done?.(); return; }
    lastPose = undefined;
    applyPose(poseAt(page, 0));
    call('SansText', page.text, 'DailyNextPage');
  }
  function speak(pages: Page[], done: () => void, reset = true): void {
    if (!pages.length) { done(); return; }
    queue = [...pages]; continuation = () => {
      if (lastPose) applyPose({ ...lastPose, torso: 0, ...(reset ? { face: 0 } : {}) });
      done();
    };
    call('BattleMenuEnable', 0);
    call('MenuBonesOff');
    nextPage();
  }

  const originalCall = host.sc.prototype.e.CallFunction;
  const functionActions = Object.values(runtime.se).filter(action => action.zb === originalCall);
  if (!functionActions.length) throw new Error('Simulator function hooks are unavailable.');
  for (const action of functionActions) {
    action.zb = function (...args) {
      if (finished) return;
      const name = String(args[0]).toLowerCase();
      const params = [...((args[1] ?? []) as (string | number)[])];
      args[1] = params;
      gestures.observe(name, params);
      const proceed = (): unknown => {
        const result = originalCall.apply(this, args);
        const body = runtime.types.t24.d[0];
        if (body) body.Wf = gestures.speed;
        return result;
      };
      try {
        if (name === 'dailynextpage') {
          call('TLPause');
          // Finish the destroyed-font event before constructing its replacement.
          // Keep the same bubble between pages, including during this frame's draw.
          queueMicrotask(() => {
            if (finished) return;
            if (!queue.length) call('EndSansText');
            nextPage();
          });
          return;
        }
        if (name === 'blackscreen' && Number(params[0]) === 1) speechAudio.stopOpening();
        if (name === 'startattack') {
          if (dead) return;
          const turn = Number(runtime.types[F.sans.type].d[0]?.hb[F.sans.hitAttempts] ?? 0);
          const pages = progress.advance(turn);
          if (pages.length) { speak(pages, () => { proceed(); }); return; }
        }
        if (name === 'sanstext') {
          const text = String(params[0]);
          const done = (): void => { call(String(params[1] || 'EndSansText')); };
          if (text === 'ready?') { speechAudio.startOpening(); speak(opening(), done, false); return; }
          if (text === '__daily_opening_threat__') { speak(openingThreat(), done, false); return; }
          if (text === 'here we go.') { speak(afterOpening(), done); return; }
          if (text === 'huff... puff...') { speak(finalDialogue(), done, false); return; }
        }
        if (name === 'menuspare') {
          const turn = Number(runtime.types[F.sans.type].d[0]?.hb[F.sans.hitAttempts] ?? 0);
          if (turn === 13) { speak(spareDialogue(), () => { proceed(); }); return; }
        }
        if (name === 'menuuseitem') {
          food = true;
          try { return proceed(); } finally { food = false; }
        }
        if (name === 'win2') { finish('won'); return; }
        return proceed();
      } catch (error) { fail(error); }
    };
  }

  // Slow only Sans's restored speech to the native 2-frame character cadence.
  // Existing narrator/menu text and all combat timing retain upstream behavior.
  const timer = runtime.se[F.timerAction];
  const addTime = timer.zb;
  timer.zb = function (...args) {
    if (page && this.type.name === F.speech.type && this.hb[F.speech.fullText] === page.text) {
      const position = Number(this.hb[F.speech.currentChar]);
      const pause = page.pauses[position];
      const cadence = page.cadence;
      if (pause && !usedPauses.has(position)) { this.hb[F.speech.timer] = Number(this.hb[F.speech.timer]) - pause / cadence; usedPauses.add(position); }
      this.hb[F.speech.voice] = page.silent ? '' : 'SansSpeak';
      if (page.silent) {
        const bubble = runtime.types.t28.d.at(-1);
        if (bubble) {
          // Use the original small sprite, preserving its pixels and dimensions.
          if (bubble.width !== 105) runtime.se[F.setAnimationAction].zb.call(bubble, 'DailyThreat', 1);
          this.visible = false;
          threatText.show(this, bubble);
        }
      }
      // The upstream renderer reveals at 30 chars/s; native Sans uses 15.
      args[1] = Number(args[1]) / cadence;
    }
    return addTime.apply(this, args);
  };
  send('ready');
}

async function boot(): Promise<void> {
  if (parent === window) { location.replace('../../'); return; }
  if (parent.document.querySelector<HTMLIFrameElement>('#simulator')?.contentWindow !== window) throw new Error('Start a daily attempt from Daily Sans.');
  await navigator.locks.request('daily-sans-store', () => {
    const history = parseHistory(localStorage.getItem(STORAGE_KEY));
    const active = history.days[utcDay()]?.attempts.find(a => a.id === attemptId && a.outcome === 'active');
    if (!active || active.launched) throw new Error('This attempt has already started. Reloading keeps it used.');
    active.launched = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  });
  for (const file of ['jquery-3.4.1.min.js', 'c2runtime.js']) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => reject(new Error('Game scripts took too long to load.')), 15000);
      script.src = new URL(file, location.href).href;
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); reject(new Error(`Could not load ${file}.`)); };
      document.body.append(script);
    });
  }
  // No offline worker: daily attempts must always use the current event graph.
  await threatText.load();
  await speechAudio.load(new URL('media/sansspeak.ogg', location.href), new URL('../../daily-assets/birds.ogg', location.href));
  host.cr_createRuntime('c2canvas');
  const deadline = performance.now() + 20000;
  await new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      const runtime = host.cr_getC2Runtime();
      if (runtime?.Vg?.['4067313995094888'] && runtime.se?.[F.timerAction]) {
        clearInterval(timer);
        try { install(runtime); resolve(); } catch (error) { reject(error); }
      } else if (performance.now() > deadline) { clearInterval(timer); reject(new Error('The simulator took too long to load.')); }
    }, 0);
  });
  let requestedPause = false;
  const suspend = (): void => {
    const paused = finished || document.hidden || requestedPause;
    speechAudio.setPaused(paused); host.cr_setSuspended(paused);
  };
  document.addEventListener('visibilitychange', suspend);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.channel !== CHANNEL || event.data.attemptId !== attemptId) return;
    if (event.data.kind === 'pause') { requestedPause = true; suspend(); }
    else if (event.data.kind === 'resume' && !finished) { requestedPause = false; suspend(); }
    else if (event.data.kind === 'stop') { finished = true; stopVoice(); speechAudio.stopOpening(); threatText.hide(); suspend(); }
  });
}
void boot().catch(fail);
