/** One utterance per revealed, non-whitespace character, including native ending pages. */
export class VoiceGate {
  private last = '';
  reset(): void { this.last = ''; }
  allow(id: number, position: number, text: string): boolean {
    const key = `${id}:${position}`;
    if (key === this.last) return false;
    this.last = key;
    return position > 0 && /\S/.test(text[position - 1] ?? '');
  }
}
