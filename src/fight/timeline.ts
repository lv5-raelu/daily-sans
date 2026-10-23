export interface Instruction { delay: string; op: string; args: string[] }
export interface TimelineHost { command(op: string, args: string[], value: (s: string) => number): void }

/** The reference attack format uses one-based line numbers and cumulative delays. */
export class Timeline {
  readonly rows: Instruction[];
  readonly vars: Record<string, number> = { pi: Math.PI };
  readonly labels = new Map<string, number>();
  pc = 0;
  wait = 0;
  paused = false;
  ended = false;
  private scheduled = false;
  constructor(csv: string, readonly host: TimelineHost, readonly random = Math.random) {
    this.rows = csv.trim().split(/\r?\n/).map(line => {
      const [delay = '0', op = '', ...args] = line.split(',').map(s => s.trim());
      return { delay, op, args };
    });
    this.rows.forEach((r, i) => { if (r.op.startsWith(':')) this.labels.set(r.op.slice(1), i); });
  }
  value = (s = ''): number => s.startsWith('$') ? (this.vars[s.slice(1)] ?? 0) : Number(s || 0);
  private destination(s: string): number { return this.labels.get(s) ?? this.value(s) - 1; }
  tick(dt: number): void {
    if (this.paused || this.ended) return;
    this.wait -= dt;
    let budget = 10000;
    while (!this.paused && !this.ended && this.pc < this.rows.length) {
      if (--budget === 0) throw new Error(`Attack timeline has an unbounded loop at line ${this.pc + 1}`);
      const row = this.rows[this.pc];
      if (!this.scheduled) { this.wait += this.value(row.delay); this.scheduled = true; }
      if (this.wait > 0.0001) return;
      this.scheduled = false;
      const a = row.args; const v = this.value; const op = row.op;
      const x = v(a[1]), y = v(a[2]);
      let jump: number | undefined;
      if (op.startsWith(':')) { /* label */ }
      else if (op === 'SET') this.vars[a[0]] = x;
      else if (op === 'ADD') this.vars[a[0]] = x + y;
      else if (op === 'SUB') this.vars[a[0]] = x - y;
      else if (op === 'MUL') this.vars[a[0]] = x * y;
      else if (op === 'DIV') this.vars[a[0]] = y === 0 ? 0 : x / y;
      else if (op === 'MOD') this.vars[a[0]] = x % y;
      else if (op === 'SIN') this.vars[a[0]] = Math.sin(x * Math.PI / 180);
      else if (op === 'COS') this.vars[a[0]] = Math.cos(x * Math.PI / 180);
      else if (op === 'FLOOR') this.vars[a[0]] = Math.floor(x);
      else if (op === 'RND') this.vars[a[0]] = Math.floor(this.random() * x);
      else if (op === 'ANGLE') this.vars[a[0]] = Math.atan2(v(a[4]) - v(a[2]), v(a[3]) - v(a[1])) * 180 / Math.PI;
      else if (op === 'JMPABS') jump = this.destination(a[0]);
      else if (op === 'JMPREL') jump = this.pc + v(a[0]);
      else if (op === 'JMPZ' && x === 0 || op === 'JMPNZ' && x !== 0 || op === 'JMPE' && x === y || op === 'JMPNE' && x !== y || op === 'JMPL' && x < y || op === 'JMPNL' && x >= y || op === 'JMPNG' && x <= y) jump = this.destination(a[0]);
      else if (op.startsWith('JMP')) { /* condition was false */ }
      else if (op === 'TLPause') this.paused = true;
      else if (op === 'EndAttack') { this.ended = true; this.host.command(op, a, v); }
      else this.host.command(op, a, v);
      this.pc = jump ?? this.pc + 1;
      if (this.pc < 0 || this.pc > this.rows.length) throw new Error(`Invalid timeline jump ${this.pc + 1}`);
    }
    if (this.pc >= this.rows.length) this.ended = true;
  }
}
