import type { Input } from './simulation';

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

export class Controls {
  private keys = new Set<string>();
  private touches = new Set<string>();
  active = false;

  constructor(onAction: (action: 'start' | 'pause' | 'retry') => void) {
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (this.active && GAME_KEYS.has(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') onAction('pause');
      if (event.code === 'KeyR') onAction('retry');
      if (event.code === 'Enter' && !(event.target instanceof HTMLButtonElement)) onAction('start');
    });
    window.addEventListener('keyup', (event) => { this.keys.delete(event.code); });
    window.addEventListener('blur', () => this.clear());
    document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach((button) => {
      const direction = button.dataset.direction!;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.touches.add(direction);
        button.classList.add('pressed');
      });
      const release = () => { this.touches.delete(direction); button.classList.remove('pressed'); };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }

  read(): Input {
    return {
      left: this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.touches.has('left'),
      right: this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.touches.has('right'),
      up: this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.keys.has('Space') || this.touches.has('up'),
      down: this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.touches.has('down'),
    };
  }

  clear(): void {
    this.keys.clear();
    this.touches.clear();
    document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
  }
}
