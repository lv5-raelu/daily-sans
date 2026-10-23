import data from './dialogue-data.json';
import animation from './animation-data.json';

export interface Pose { face: number; torso: number; sweat: number }
export interface PoseCue { position: number; face?: number; torso?: number }
export interface Page { key?: string; text: string; pauses: Record<number, number>; initial: Pose; cues: PoseCue[]; silent: boolean; cadence: number }
export function parsePage(raw: string): Page {
  let text = '';
  const pauses: Record<number, number> = {};
  const cues: PoseCue[] = [];
  for (let i = 0; i < raw.length;) {
    const tail = raw.slice(i);
    const pose = /^\\([EM])(\d)/.exec(tail);
    if (pose) {
      cues.push({ position: text.length, [pose[1] === 'E' ? 'face' : 'torso']: Number(pose[2]) });
      i += pose[0].length; continue;
    }
    const control = /^\\(?:X|[RYWGBO])/.exec(tail);
    if (control) { i += control[0].length; continue; }
    const pause = /^\^(\d)/.exec(tail);
    if (pause) { pauses[text.length] = Number(pause[1]) / 10; i += 2; continue; }
    if (raw[i] === '&') text += '\n';
    else if (raw[i] !== '/' && raw[i] !== '%') text += raw[i];
    i++;
  }
  const silent = raw.startsWith('Should&be&burning');
  return { text, pauses, initial: { face: 0, torso: 0, sweat: 0 }, cues, silent, cadence: silent ? 4 : 2 };
}
const text = data.text as Record<string, string>;
export function poseAt(page: Page, position: number): Pose {
  const pose = { ...page.initial };
  for (const cue of page.cues) {
    if (cue.position > position) break;
    if (cue.face !== undefined) pose.face = cue.face;
    if (cue.torso !== undefined) pose.torso = cue.torso;
  }
  return pose;
}
const pages = (keys: string[], initial: Pose, cadence = 2): Page[] => {
  let pose = initial;
  return keys.map(key => {
    const page = { ...parsePage(text[key]), key, initial: { ...pose }, cadence };
    pose = poseAt(page, page.text.length);
    return page;
  });
};
export const opening = (): Page[] => pages(data.opening.slice(0, 3), animation.groups.opening);
export const openingThreat = (): Page[] => pages(data.opening.slice(3), animation.groups.threat, 4);
// Native intr == 0; the next two keys are the mutually exclusive intr == 1 retry variant.
export const afterOpening = (): Page[] => pages(data.afterOpening.slice(0, 2), animation.groups.afterOpening, 1);
export const finalDialogue = (): Page[] => pages(data.final, animation.groups.final, 1);
export const spareDialogue = (): Page[] => pages(data.spare, animation.groups.spare);
export const turnDialogue = (turn: number): Page[] => pages((data.turns as Record<string, string[]>)[String(turn)] ?? [], (animation.turns as Record<string, Pose>)[String(turn)] ?? { face: 0, torso: 0, sweat: 0 });

/** Native dialogue advances only for a new successful Fight action. */
export class DialogueProgress {
  private reached = 0;
  advance(turn: number): Page[] {
    if (turn <= this.reached) return [];
    this.reached = turn;
    return turnDialogue(turn);
  }
}
