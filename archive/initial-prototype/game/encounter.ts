export type SoulMode = 'red' | 'blue';

export const ENCOUNTER = {
  id: 'first-encounter-v1',
  title: 'The first encounter',
  version: 1,
  duration: 42,
  health: 92,
  step: 1 / 120,
  arena: { x: 166, y: 282, width: 468, height: 160 },
} as const;

export interface Phase {
  id: string;
  name: string;
  start: number;
  end: number;
  mode: SoulMode;
  hint: string;
}

export const PHASES: Phase[] = [
  { id: 'bones', name: 'Find your feet', start: 0, end: 14, mode: 'red', hint: 'Move through the gaps. You can move in any direction.' },
  { id: 'gravity', name: 'A change of heart', start: 14, end: 28, mode: 'blue', hint: 'Gravity is on. Tap ↑ or W to jump. Hold for a higher jump.' },
  { id: 'blasters', name: 'One last thing', start: 28, end: 42, mode: 'red', hint: 'Move freely again. Get out of the marked lanes before they fire.' },
];

export type Attack =
  | { at: number; kind: 'gap'; from: 'left' | 'right'; gap: number; speed: number }
  | { at: number; kind: 'hurdle'; from: 'left' | 'right'; height: number; speed: number }
  | { at: number; kind: 'beam'; axis: 'horizontal' | 'vertical'; position: number; width: number; warning: number; duration: number };

// Authored and versioned: every retry uses the same sequence.
export const ATTACKS: Attack[] = [
  { at: 1.2, kind: 'gap', from: 'right', gap: 358, speed: 130 },
  { at: 3.7, kind: 'gap', from: 'left', gap: 312, speed: 136 },
  { at: 6.2, kind: 'gap', from: 'right', gap: 408, speed: 142 },
  { at: 8.7, kind: 'gap', from: 'left', gap: 350, speed: 148 },
  { at: 10.6, kind: 'gap', from: 'right', gap: 328, speed: 152 },
  { at: 15.2, kind: 'hurdle', from: 'right', height: 30, speed: 154 },
  { at: 17.2, kind: 'hurdle', from: 'right', height: 48, speed: 160 },
  { at: 19.2, kind: 'hurdle', from: 'left', height: 30, speed: 166 },
  { at: 21.4, kind: 'hurdle', from: 'right', height: 60, speed: 170 },
  { at: 23.6, kind: 'hurdle', from: 'left', height: 44, speed: 174 },
  { at: 28.7, kind: 'beam', axis: 'vertical', position: 400, width: 62, warning: 1.1, duration: 0.6 },
  { at: 30.6, kind: 'beam', axis: 'horizontal', position: 360, width: 42, warning: 1.1, duration: 0.6 },
  { at: 32.5, kind: 'gap', from: 'right', gap: 330, speed: 155 },
  { at: 33, kind: 'beam', axis: 'vertical', position: 290, width: 66, warning: 1.1, duration: 0.6 },
  { at: 35, kind: 'beam', axis: 'horizontal', position: 317, width: 36, warning: 1, duration: 0.6 },
  { at: 36.2, kind: 'gap', from: 'left', gap: 392, speed: 160 },
  { at: 37.5, kind: 'beam', axis: 'vertical', position: 500, width: 64, warning: 1, duration: 0.6 },
  { at: 39.3, kind: 'beam', axis: 'horizontal', position: 402, width: 44, warning: 1, duration: 0.6 },
];

export function phaseAt(time: number): Phase {
  return PHASES.find((phase) => time < phase.end) ?? PHASES[PHASES.length - 1];
}
