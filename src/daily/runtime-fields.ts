/** Bindings to the pinned export, verified against its serialized event actions. */
export const RUNTIME_FIELDS = {
  sans: { type: 't25', hitAttempts: 1, nextAttack: 0, dodgeState: 2, dodgeTimer: 3, xSpeed: 5 },
  speech: { type: 't48', voice: 1, fullText: 2, endFunction: 3, interactive: 4, currentChar: 5, timer: 6 },
  timerAction: String(Number('9960523751992423')),
  voicePlayAction: '7355169452177231',
  audioStopAction: '1623888928729483',
  setAnimationAction: '1205667824253445',
  characterActions: ['8362167824849778', '3103315003842606'],
  animationVariable: '7991719124201338',
  bobTimerAction: '1285065763689705',
  dodgeActions: { out: '645637146194496', hold: '601091087436735', back: '615694957493994' },
} as const;
