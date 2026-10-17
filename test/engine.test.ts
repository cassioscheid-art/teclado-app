import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { SONGS, Song, noteToMidi, parseVoice } from '../src/songs';

const simple: Song = {
  id: 't',
  title: 't',
  composer: 't',
  level: 'Fácil',
  bpm: 60, // 1 tempo = 1 segundo
  beatsPerBar: 4,
  notes: [...parseVoice('C4 D4 E4 F4', 'R'), ...parseVoice('C3:4', 'L')],
};

function at(engine: Engine, beat: number) {
  engine.playing = true;
  engine.update((beat - engine.beat) * engine.secondsPerBeat);
}

describe('songs', () => {
  it('converte nomes de notas', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#3')).toBe(54);
    expect(noteToMidi('Bb2')).toBe(46);
  });

  it('lê pausas e acordes', () => {
    const n = parseVoice('C4:2 R:1 C4+E4:0.5', 'R');
    expect(n.map((x) => [x.midi, x.start, x.dur])).toEqual([
      [60, 0, 2],
      [60, 3, 0.5],
      [64, 3, 0.5],
    ]);
  });

  it('todas as músicas carregam e têm as duas mãos', () => {
    for (const s of SONGS) {
      expect(s.notes.length).toBeGreaterThan(8);
      expect(s.notes.some((n) => n.hand === 'L')).toBe(true);
      expect(s.notes.some((n) => n.hand === 'R')).toBe(true);
    }
  });
});

describe('engine', () => {
  it('avalia perfeito, bom e nota errada', () => {
    const e = new Engine(simple);
    e.reset(0);
    at(e, 0.02);
    expect(e.noteOn(60)).toBe('perfect');
    at(e, 1.15);
    expect(e.noteOn(62)).toBe('good');
    expect(e.noteOn(71)).toBe('wrong');
    expect(e.stats).toMatchObject({ perfect: 1, good: 1, wrong: 1 });
  });

  it('marca notas perdidas quando passam', () => {
    const e = new Engine(simple);
    e.reset(0);
    e.settings.hands = 'R';
    at(e, 0.5);
    expect(e.stats.miss).toBe(1);
  });

  it('Wait Mode espera a nota certa', () => {
    const e = new Engine(simple);
    e.settings.waitMode = true;
    e.settings.hands = 'R';
    e.reset(0);
    at(e, 5);
    expect(e.beat).toBe(0);
    expect(e.noteOn(60)).toBe('perfect');
    at(e, 5);
    expect(e.beat).toBe(1);
  });

  it('a mão inativa é tocada pelo app', () => {
    const e = new Engine(simple);
    e.settings.hands = 'R';
    const auto: number[] = [];
    e.on((ev) => ev.type === 'auto' && auto.push(ev.note.midi));
    e.reset(1);
    at(e, 0.01);
    expect(auto).toEqual([48]);
  });

  it('repete o trecho em loop', () => {
    const e = new Engine({ ...simple, beatsPerBar: 2 });
    e.settings.loop = { from: 0, to: 1 };
    let loops = 0;
    e.on((ev) => ev.type === 'loop' && loops++);
    e.reset(0);
    at(e, 2.01);
    expect(loops).toBe(1);
    expect(e.beat).toBeLessThan(0);
  });

  it('velocidade reduz o tempo', () => {
    const e = new Engine(simple);
    e.settings.speed = 0.5;
    expect(e.secondsPerBeat).toBe(2);
  });
});
