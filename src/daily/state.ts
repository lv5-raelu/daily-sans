export const ATTEMPT_LIMIT = 6;
export const STORAGE_KEY = 'daily-sans:v1';
export type Outcome = 'active' | 'lost' | 'won' | 'abandoned';
export interface Attempt {
  id: string;
  startedAt: string;
  outcome: Outcome;
  damage: number;
  healed: number;
  launched?: boolean;
}
export interface Day { attempts: Attempt[] }
export interface History { version: 1; days: Record<string, Day> }
export const emptyHistory = (): History => ({ version: 1, days: {} });
export const utcDay = (date = new Date()): string => date.toISOString().slice(0, 10);
export function previousDay(day: string): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) - 86400000));
}
export const dayResult = (history: History, day: string): Day => history.days[day] ?? { attempts: [] };
export const won = (day: Day): boolean => day.attempts.some(a => a.outcome === 'won');
export const failures = (day: Day): number => day.attempts.filter(a => a.outcome === 'lost' || a.outcome === 'abandoned').length;
export const left = (day: Day): number => Math.max(0, ATTEMPT_LIMIT - failures(day));
export function totals(day: Day): { damage: number; healed: number } {
  return day.attempts.reduce((sum, a) => ({ damage: sum.damage + a.damage, healed: sum.healed + a.healed }), { damage: 0, healed: 0 });
}
export function streak(history: History, today: string): number {
  const result = dayResult(history, today);
  if (!won(result) && left(result) === 0 && !result.attempts.some(a => a.outcome === 'active')) return 0;
  let day = won(result) ? today : previousDay(today);
  let count = 0;
  while (won(dayResult(history, day))) { count++; day = previousDay(day); }
  return count;
}
export function begin(history: History, day: string, id: string, startedAt: string): Attempt {
  const result = history.days[day] ??= { attempts: [] };
  if (Object.values(history.days).some(d => d.attempts.some(a => a.outcome === 'active')))
    throw new Error('A daily attempt is already in progress.');
  if (won(result)) throw new Error('Today’s fight is complete. Come back tomorrow.');
  if (left(result) === 0) throw new Error('No attempts left today.');
  const attempt: Attempt = { id, startedAt, outcome: 'active', damage: 0, healed: 0 };
  result.attempts.push(attempt);
  return attempt;
}
export function update(history: History, day: string, id: string, damage: number, healed: number, outcome?: Exclude<Outcome, 'active'>): void {
  const attempt = history.days[day]?.attempts.find(a => a.id === id);
  if (!attempt || attempt.outcome !== 'active') return;
  if (![damage, healed].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid fight counters.');
  attempt.damage = Math.max(attempt.damage, damage);
  attempt.healed = Math.max(attempt.healed, healed);
  if (outcome) attempt.outcome = outcome;
}
export function shareText(history: History, day: string): string {
  const result = dayResult(history, day);
  const remaining = left(result);
  const { damage, healed } = totals(result);
  return `Daily Sans · Streak ${streak(history, day)}\n${'⬛'.repeat(ATTEMPT_LIMIT - remaining)}${'🟩'.repeat(remaining)}  ${remaining}/${ATTEMPT_LIMIT} left\n${damage} Damage Taken · ${healed} Damage Healed\ndaily-sans.github.io`;
}
export function parseHistory(raw: string | null): History {
  if (!raw) return emptyHistory();
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('days' in data) || !data.days || typeof data.days !== 'object' || Array.isArray(data.days)) throw new Error('Saved results could not be read.');
  const history = data as History;
  for (const [day, result] of Object.entries(history.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !result || !Array.isArray(result.attempts) || result.attempts.length > ATTEMPT_LIMIT) throw new Error('Saved results could not be read.');
    const ids = new Set<string>();
    for (const a of result.attempts) {
      if (!a || typeof a.id !== 'string' || ids.has(a.id) || typeof a.startedAt !== 'string' || (a.launched !== undefined && typeof a.launched !== 'boolean') || !['active', 'lost', 'won', 'abandoned'].includes(a.outcome) || ![a.damage, a.healed].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Saved results could not be read.');
      ids.add(a.id);
    }
  }
  return history;
}
