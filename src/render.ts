import { Engine } from './engine';

const NAMES_PT = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
const BLACK = new Set([1, 3, 6, 8, 10]);

export const isBlack = (midi: number) => BLACK.has(midi % 12);
export const noteName = (midi: number) => NAMES_PT[midi % 12];

const COLORS = {
  R: '#4f8cff',
  L: '#2fc48a',
  inactive: 'rgba(160,170,190,0.35)',
  perfect: '#ffd34d',
  good: '#9be15d',
  miss: '#ff5c6c',
};

interface Popup {
  text: string;
  color: string;
  x: number;
  born: number;
}

interface KeyRect {
  midi: number;
  x: number;
  w: number;
  black: boolean;
}

/** Desenha as notas caindo e o teclado no canvas. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private keys: KeyRect[] = [];
  private keyByMidi = new Map<number, KeyRect>();
  private popups: Popup[] = [];
  private w = 0;
  private h = 0;
  keyboardHeight = 0;
  pressed = new Map<number, string>(); // midi -> cor
  showNames = true;
  lookaheadSeconds = 3;

  constructor(
    private canvas: HTMLCanvasElement,
    private low: number,
    private high: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  /** Intervalo de teclas que cobre a música, começando e terminando em Dó. */
  static rangeFor(midis: number[]): [number, number] {
    let low = Math.min(...midis);
    let high = Math.max(...midis);
    low = Math.floor(low / 12) * 12;
    high = Math.ceil((high + 1) / 12) * 12;
    if (high - low < 24) high = low + 24;
    return [low, high];
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.keyboardHeight = Math.min(160, Math.max(90, this.h * 0.22));
    this.layoutKeys();
  }

  private layoutKeys() {
    const whites: number[] = [];
    for (let m = this.low; m <= this.high; m++) if (!isBlack(m)) whites.push(m);
    const ww = this.w / whites.length;
    this.keys = [];
    whites.forEach((m, i) => this.keys.push({ midi: m, x: i * ww, w: ww, black: false }));
    for (let m = this.low; m <= this.high; m++) {
      if (!isBlack(m)) continue;
      const left = this.keys.find((k) => k.midi === m - 1);
      if (left) this.keys.push({ midi: m, x: left.x + ww * 0.68, w: ww * 0.64, black: true });
    }
    this.keyByMidi = new Map(this.keys.map((k) => [k.midi, k]));
  }

  /** Qual tecla está sob um ponto do teclado na tela (para toque). */
  keyAt(x: number, y: number): number | null {
    const top = this.h - this.keyboardHeight;
    if (y < top) return null;
    const blackBottom = top + this.keyboardHeight * 0.62;
    if (y < blackBottom) {
      const b = this.keys.find((k) => k.black && x >= k.x && x < k.x + k.w);
      if (b) return b.midi;
    }
    const wkey = this.keys.find((k) => !k.black && x >= k.x && x < k.x + k.w);
    return wkey ? wkey.midi : null;
  }

  popup(text: string, color: string, midi?: number) {
    const k = midi !== undefined ? this.keyByMidi.get(midi) : undefined;
    this.popups.push({ text, color, x: k ? k.x + k.w / 2 : this.w / 2, born: performance.now() });
    if (this.popups.length > 6) this.popups.shift();
  }

  gradeColor(grade: string) {
    return (COLORS as Record<string, string>)[grade] ?? COLORS.R;
  }

  draw(engine: Engine) {
    const { ctx, w, h } = this;
    const hitY = h - this.keyboardHeight;
    const pxPerBeat = hitY / (this.lookaheadSeconds / engine.secondsPerBeat);

    ctx.fillStyle = '#0f1420';
    ctx.fillRect(0, 0, w, h);

    // Faixas das teclas pretas e linhas de compasso.
    for (const k of this.keys) {
      if (k.black) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(k.x, 0, k.w, hitY);
      } else if (k.midi % 12 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(k.x, 0, 1, hitY);
      }
    }
    const bar = engine.song.beatsPerBar;
    const firstBar = Math.ceil(engine.beat / bar);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.font = '11px system-ui, sans-serif';
    for (let b = firstBar; b * bar < engine.beat + hitY / pxPerBeat; b++) {
      const y = hitY - (b * bar - engine.beat) * pxPerBeat;
      ctx.fillRect(0, y, w, 1);
      ctx.fillText(String(b + 1), 4, y - 3);
    }

    // Região de loop.
    if (engine.settings.loop) {
      const [from, to] = engine.loopRange;
      const yTo = hitY - (to - engine.beat) * pxPerBeat;
      const yFrom = hitY - (from - engine.beat) * pxPerBeat;
      ctx.fillStyle = 'rgba(255,211,77,0.06)';
      ctx.fillRect(0, Math.max(0, yTo), w, Math.min(hitY, yFrom) - Math.max(0, yTo));
    }

    // Notas caindo.
    for (const n of engine.notes) {
      const k = this.keyByMidi.get(n.midi);
      if (!k) continue;
      const yBottom = hitY - (n.start - engine.beat) * pxPerBeat;
      const yTop = yBottom - n.dur * pxPerBeat;
      if (yTop > hitY || yBottom < 0) continue;
      const active = engine.isActive(n.hand);
      let color = active ? COLORS[n.hand] : COLORS.inactive;
      if (n.grade) color = this.gradeColor(n.grade);
      const pad = k.black ? 1 : 3;
      const x = k.x + pad;
      const nw = k.w - pad * 2;
      const top = Math.max(yTop + 1, -10);
      const bottom = Math.min(yBottom - 1, hitY);
      if (bottom <= top) continue;
      ctx.globalAlpha = n.grade === 'miss' ? 0.45 : 1;
      ctx.fillStyle = color;
      roundRect(ctx, x, top, nw, bottom - top, Math.min(6, nw / 2));
      ctx.fill();
      if (this.showNames && nw > 16 && bottom - top > 18) {
        ctx.fillStyle = 'rgba(10,15,25,0.85)';
        ctx.font = `600 ${Math.min(13, nw * 0.42)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(noteName(n.midi), x + nw / 2, bottom - 6);
        ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;
    }

    // Linha de acerto.
    const grad = ctx.createLinearGradient(0, hitY - 6, 0, hitY);
    grad.addColorStop(0, 'rgba(79,140,255,0)');
    grad.addColorStop(1, 'rgba(79,140,255,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, hitY - 6, w, 6);

    this.drawKeyboard(engine, hitY);
    this.drawPopups(hitY);
  }

  private drawKeyboard(engine: Engine, top: number) {
    const { ctx } = this;
    const kh = this.keyboardHeight;
    // Teclas que o aluno deve tocar agora.
    const expected = new Map<number, string>();
    for (const n of engine.notes) {
      if (!engine.isActive(n.hand) || n.grade) continue;
      if (n.start <= engine.beat + 0.05 && n.start + Math.max(n.dur, 0.25) > engine.beat) {
        expected.set(n.midi, COLORS[n.hand]);
      }
    }
    for (const black of [false, true]) {
      for (const k of this.keys) {
        if (k.black !== black) continue;
        const h = black ? kh * 0.62 : kh;
        const pressed = this.pressed.get(k.midi);
        const want = expected.get(k.midi);
        ctx.fillStyle = pressed ?? (black ? '#1b1f2a' : '#f4f5f8');
        roundRect(ctx, k.x + 0.5, top, k.w - 1, h, 4, true);
        ctx.fill();
        if (want && !pressed) {
          ctx.fillStyle = want;
          ctx.globalAlpha = 0.45 + 0.25 * Math.sin(performance.now() / 120);
          roundRect(ctx, k.x + 0.5, top, k.w - 1, h, 4, true);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (!black && k.midi % 12 === 0) {
          ctx.fillStyle = '#7a8296';
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Dó${Math.floor(k.midi / 12) - 1}`, k.x + k.w / 2, top + h - 8);
          ctx.textAlign = 'left';
        }
      }
    }
  }

  private drawPopups(hitY: number) {
    const { ctx } = this;
    const now = performance.now();
    this.popups = this.popups.filter((p) => now - p.born < 700);
    ctx.textAlign = 'center';
    ctx.font = '700 16px system-ui, sans-serif';
    for (const p of this.popups) {
      const t = (now - p.born) / 700;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, Math.min(Math.max(p.x, 40), this.w - 40), hitY - 20 - t * 40);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  flatTop = false,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, flatTop ? [0, 0, r, r] : r);
}
