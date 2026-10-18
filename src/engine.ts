import { Hand, Note, Song, songLength } from './songs';

export type Grade = 'perfect' | 'good' | 'miss';
export type HandMode = 'both' | 'R' | 'L';

export interface NoteState extends Note {
  index: number;
  grade?: Grade;
  /** Atraso em segundos (negativo = adiantado). */
  offset?: number;
}

export interface Settings {
  speed: number; // 1 = tempo original
  hands: HandMode;
  waitMode: boolean;
  loop: { from: number; to: number } | null; // em compassos, "to" exclusivo
}

export interface Stats {
  perfect: number;
  good: number;
  miss: number;
  wrong: number;
  streak: number;
  bestStreak: number;
}

export type EngineEvent =
  | { type: 'hit'; note: NoteState; grade: Grade }
  | { type: 'miss'; note: NoteState }
  | { type: 'wrong'; midi: number }
  | { type: 'auto'; note: NoteState } // nota da outra mão tocada pelo app
  | { type: 'loop' }
  | { type: 'end' };

export const PERFECT_WINDOW = 0.08; // segundos
export const GOOD_WINDOW = 0.18;

/**
 * Motor de prática: controla o relógio da música (em tempos), avalia as notas
 * tocadas e aplica as ferramentas de treino (velocidade, mãos, Wait Mode, loop).
 */
export class Engine {
  readonly notes: NoteState[];
  readonly length: number;
  beat = 0;
  playing = false;
  finished = false;
  stats: Stats = emptyStats();
  settings: Settings = { speed: 1, hands: 'both', waitMode: false, loop: null };
  private autoCursor = 0;
  private listeners: ((e: EngineEvent) => void)[] = [];

  constructor(readonly song: Song) {
    this.notes = [...song.notes]
      .sort((a, b) => a.start - b.start || a.midi - b.midi)
      .map((n, index) => ({ ...n, index }));
    this.length = songLength(song);
  }

  on(fn: (e: EngineEvent) => void) {
    this.listeners.push(fn);
  }

  private emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }

  /** Segundos reais por tempo, considerando a velocidade escolhida. */
  get secondsPerBeat() {
    return 60 / (this.song.bpm * this.settings.speed);
  }

  isActive(hand: Hand) {
    return this.settings.hands === 'both' || this.settings.hands === hand;
  }

  get loopRange(): [number, number] {
    const l = this.settings.loop;
    if (!l) return [0, this.length];
    const bar = this.song.beatsPerBar;
    return [l.from * bar, Math.min(l.to * bar, this.length)];
  }

  get barCount() {
    return Math.ceil(this.length / this.song.beatsPerBar);
  }

  /** Começa um pouco antes do início para dar tempo de ver as notas caindo. */
  reset(leadIn = 2) {
    const [from] = this.loopRange;
    this.seek(from - leadIn);
    this.stats = emptyStats();
    this.finished = false;
  }

  seek(beat: number) {
    this.beat = beat;
    for (const n of this.notes) {
      if (n.start >= beat - 1e-6) {
        n.grade = undefined;
        n.offset = undefined;
      }
    }
    this.autoCursor = this.notes.findIndex((n) => n.start >= beat - 1e-6);
    if (this.autoCursor < 0) this.autoCursor = this.notes.length;
  }

  /** Próximas notas que o aluno precisa tocar e que ainda não foram avaliadas. */
  private pendingAt(beat: number): NoteState[] {
    return this.notes.filter(
      (n) => this.isActive(n.hand) && !n.grade && Math.abs(n.start - beat) < 1e-6,
    );
  }

  /** Avança o relógio em dt segundos reais. */
  update(dt: number) {
    if (!this.playing || this.finished) return;
    let next = this.beat + dt / this.secondsPerBeat;

    if (this.settings.waitMode) {
      // Para na primeira nota da mão ativa que ainda não foi tocada.
      const waiting = this.notes.find(
        (n) => this.isActive(n.hand) && !n.grade && n.start >= this.beat - 1e-6 && n.start <= next,
      );
      if (waiting) next = waiting.start;
    }

    // Notas da outra mão (ou todas, se nenhuma for ativa) são tocadas pelo app.
    while (this.autoCursor < this.notes.length && this.notes[this.autoCursor].start <= next) {
      const n = this.notes[this.autoCursor];
      if (!this.isActive(n.hand)) this.emit({ type: 'auto', note: n });
      this.autoCursor++;
    }

    this.beat = next;

    if (!this.settings.waitMode) {
      const missBeat = this.beat - GOOD_WINDOW / this.secondsPerBeat;
      for (const n of this.notes) {
        if (this.isActive(n.hand) && !n.grade && n.start < missBeat) {
          n.grade = 'miss';
          this.stats.miss++;
          this.stats.streak = 0;
          this.emit({ type: 'miss', note: n });
        }
      }
    }

    const [from, to] = this.loopRange;
    if (this.beat >= to) {
      if (this.settings.loop) {
        this.seek(from - 1);
        this.emit({ type: 'loop' });
      } else {
        this.finished = true;
        this.playing = false;
        this.emit({ type: 'end' });
      }
    }
  }

  /** Recebe uma nota tocada pelo aluno. */
  noteOn(midi: number): Grade | 'wrong' {
    if (!this.playing) return 'wrong';
    const spb = this.secondsPerBeat;
    let best: NoteState | undefined;
    let bestDist = Infinity;
    for (const n of this.notes) {
      if (n.midi !== midi || n.grade || !this.isActive(n.hand)) continue;
      const dist = Math.abs(n.start - this.beat) * spb;
      if (dist < bestDist) {
        best = n;
        bestDist = dist;
      }
    }

    const waitingHere = this.settings.waitMode && best && this.pendingAt(this.beat).includes(best);
    if (best && (waitingHere || bestDist <= GOOD_WINDOW)) {
      const grade: Grade = waitingHere || bestDist <= PERFECT_WINDOW ? 'perfect' : 'good';
      best.grade = grade;
      best.offset = (this.beat - best.start) * spb;
      this.stats[grade]++;
      this.stats.streak++;
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
      this.emit({ type: 'hit', note: best, grade });
      return grade;
    }

    this.stats.wrong++;
    this.stats.streak = 0;
    this.emit({ type: 'wrong', midi });
    return 'wrong';
  }

  /** Precisão de 0 a 100, contando notas erradas como penalidade. */
  get accuracy() {
    const s = this.stats;
    const total = s.perfect + s.good + s.miss + s.wrong;
    if (!total) return 100;
    return Math.round(((s.perfect + s.good * 0.7) / total) * 100);
  }

  get stars() {
    const a = this.accuracy;
    return a >= 90 ? 3 : a >= 70 ? 2 : a >= 40 ? 1 : 0;
  }
}

function emptyStats(): Stats {
  return { perfect: 0, good: 0, miss: 0, wrong: 0, streak: 0, bestStreak: 0 };
}
