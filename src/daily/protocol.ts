export const CHANNEL = 'daily-sans-fight-v1';
export type FightEvent = {
  channel: typeof CHANNEL;
  attemptId: string;
  kind: 'ready' | 'progress' | 'lost' | 'won' | 'error' | 'toggle-pause';
  damage: number;
  healed: number;
  message?: string;
};
export function isFightEvent(value: unknown): value is FightEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as FightEvent;
  return v.channel === CHANNEL && typeof v.attemptId === 'string' && ['ready', 'progress', 'lost', 'won', 'error', 'toggle-pause'].includes(v.kind) && [v.damage, v.healed].every(n => Number.isSafeInteger(n) && n >= 0);
}
