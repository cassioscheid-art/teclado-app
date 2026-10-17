export type Hand = 'L' | 'R';
export type Level = 'Fácil' | 'Médio' | 'Difícil';

export interface Note {
  midi: number;
  start: number; // em tempos (semínimas)
  dur: number; // em tempos
  hand: Hand;
}

export interface Song {
  id: string;
  title: string;
  composer: string;
  level: Level;
  bpm: number;
  beatsPerBar: number;
  notes: Note[];
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Converte "C4", "F#3", "Bb2" em número MIDI (C4 = 60). */
export function noteToMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota inválida: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + acc;
}

/**
 * Lê uma sequência como "C4:1 D4:0.5 R:0.5 C4+E4+G4:2".
 * R é pausa; "+" junta notas num acorde. A duração padrão é 1 tempo.
 */
export function parseVoice(text: string, hand: Hand, offset = 0): Note[] {
  const notes: Note[] = [];
  let t = offset;
  for (const token of text.trim().split(/\s+/)) {
    if (!token || token === '|') continue;
    const [pitches, durText] = token.split(':');
    const dur = durText ? Number(durText) : 1;
    if (!Number.isFinite(dur) || dur <= 0) throw new Error(`Duração inválida: ${token}`);
    if (pitches !== 'R') {
      for (const p of pitches.split('+')) notes.push({ midi: noteToMidi(p), start: t, dur, hand });
    }
    t += dur;
  }
  return notes;
}

function song(meta: Omit<Song, 'notes'>, right: string, left: string): Song {
  const notes = [...parseVoice(right, 'R'), ...parseVoice(left, 'L')];
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  return { ...meta, notes };
}

function bachPrelude(): Song {
  const bars = [
    ['C4', 'E4', 'G4', 'C5', 'E5'],
    ['C4', 'D4', 'A4', 'D5', 'F5'],
    ['B3', 'D4', 'G4', 'D5', 'F5'],
    ['C4', 'E4', 'G4', 'C5', 'E5'],
    ['C4', 'E4', 'A4', 'E5', 'A5'],
    ['C4', 'D4', 'F#4', 'A4', 'D5'],
    ['B3', 'D4', 'G4', 'D5', 'G5'],
    ['B3', 'C4', 'E4', 'G4', 'C5'],
    ['A3', 'C4', 'E4', 'G4', 'C5'],
    ['D3', 'A3', 'D4', 'F#4', 'C5'],
    ['G3', 'B3', 'D4', 'G4', 'B4'],
  ];
  const notes: Note[] = [];
  bars.forEach((names, bar) => {
    const [n1, n2, n3, n4, n5] = names.map(noteToMidi);
    for (let half = 0; half < 2; half++) {
      const base = bar * 4 + half * 2;
      notes.push({ midi: n1, start: base, dur: 2, hand: 'L' });
      notes.push({ midi: n2, start: base + 0.25, dur: 1.75, hand: 'L' });
      [n3, n4, n5, n3, n4, n5].forEach((midi, k) =>
        notes.push({ midi, start: base + 0.5 + k * 0.25, dur: 0.25, hand: 'R' }),
      );
    }
  });
  const end = bars.length * 4;
  notes.push({ midi: noteToMidi('C3'), start: end, dur: 4, hand: 'L' });
  notes.push({ midi: noteToMidi('C4'), start: end, dur: 4, hand: 'L' });
  notes.push({ midi: noteToMidi('E4'), start: end, dur: 4, hand: 'R' });
  notes.push({ midi: noteToMidi('G4'), start: end, dur: 4, hand: 'R' });
  notes.push({ midi: noteToMidi('C5'), start: end, dur: 4, hand: 'R' });
  return {
    id: 'preludio-do',
    title: 'Prelúdio em Dó',
    composer: 'J. S. Bach',
    level: 'Difícil',
    bpm: 60,
    beatsPerBar: 4,
    notes,
  };
}

export const SONGS: Song[] = [
  song(
    { id: 'escala-do', title: 'Escala de Dó', composer: 'Exercício', level: 'Fácil', bpm: 80, beatsPerBar: 4 },
    'C4 D4 E4 F4 G4 A4 B4 C5 | C5 B4 A4 G4 F4 E4 D4 C4:1 | R:8',
    'R:16 | C3 D3 E3 F3 G3 A3 B3 C4 | C4:1 B3 A3 G3 F3 E3 D3 C3',
  ),
  song(
    { id: 'brilha-estrelinha', title: 'Brilha, Brilha Estrelinha', composer: 'Tradicional', level: 'Fácil', bpm: 90, beatsPerBar: 4 },
    `C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 |
     G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 |
     C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2`,
    `C3:4 | F3:2 C3:2 | F3:2 C3:2 | G2:2 C3:2 |
     C3:2 F3:2 | C3:2 G2:2 | C3:2 F3:2 | C3:2 G2:2 |
     C3:4 | F3:2 C3:2 | F3:2 C3:2 | G2:2 C3:2`,
  ),
  song(
    { id: 'carneirinho', title: 'Maria Tinha um Carneirinho', composer: 'Tradicional', level: 'Fácil', bpm: 100, beatsPerBar: 4 },
    `E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 |
     E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4`,
    `C3:4 | C3:4 | G2:4 | C3:4 | C3:4 | C3:4 | G2:4 | C3:4`,
  ),
  song(
    { id: 'parabens', title: 'Parabéns pra Você', composer: 'Tradicional', level: 'Fácil', bpm: 100, beatsPerBar: 3 },
    `R:2 G4:0.75 G4:0.25 | A4 G4 C5 | B4:2 G4:0.75 G4:0.25 | A4 G4 D5 | C5:2 G4:0.75 G4:0.25 |
     G5 E5 C5 | B4 A4 F5:0.75 F5:0.25 | E5 C5 D5 | C5:3`,
    `R:3 | C3:3 | G2:3 | G2:3 | C3:3 | C3:3 | F2:3 | G2:3 | C3:3`,
  ),
  song(
    { id: 'ode-alegria', title: 'Ode à Alegria', composer: 'L. van Beethoven', level: 'Médio', bpm: 100, beatsPerBar: 4 },
    `E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 |
     E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2`,
    `C3:4 | G2:4 | C3:2 E3:2 | G2:4 |
     C3:4 | G2:4 | C3:2 E3:2 | G2:2 C3:2`,
  ),
  song(
    { id: 'jingle-bells', title: 'Jingle Bells', composer: 'J. Pierpont', level: 'Médio', bpm: 110, beatsPerBar: 4 },
    `E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 |
     F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2 |
     E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 |
     F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | G4 G4 F4 D4 | C4:4`,
    `C3:4 | C3:4 | C3:4 | C3:4 | F2:4 | C3:4 | G2:4 | G2:4 |
     C3:4 | C3:4 | C3:4 | C3:4 | F2:4 | C3:4 | G2:4 | C3:4`,
  ),
  song(
    { id: 'minueto-sol', title: 'Minueto em Sol', composer: 'C. Petzold', level: 'Médio', bpm: 100, beatsPerBar: 3 },
    `D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 |
     C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3`,
    `G3:2 A3 | B3:3 | C4:3 | B3:3 | A3:3 | G3:3 | D4 B3 G3 | D4 D3:0.5 C4:0.5 B3:0.5 A3:0.5`,
  ),
  song(
    { id: 'fur-elise', title: 'Für Elise', composer: 'L. van Beethoven', level: 'Difícil', bpm: 60, beatsPerBar: 1.5 },
    `E5:0.25 D#5:0.25 | E5:0.25 D#5:0.25 E5:0.25 B4:0.25 D5:0.25 C5:0.25 |
     A4:0.5 R:0.25 C4:0.25 E4:0.25 A4:0.25 | B4:0.5 R:0.25 E4:0.25 G#4:0.25 B4:0.25 |
     C5:0.5 R:0.25 E4:0.25 E5:0.25 D#5:0.25 | E5:0.25 D#5:0.25 E5:0.25 B4:0.25 D5:0.25 C5:0.25 |
     A4:0.5 R:0.25 C4:0.25 E4:0.25 A4:0.25 | B4:0.5 R:0.25 E4:0.25 C5:0.25 B4:0.25 | A4:1.5`,
    `R:2 | A2:0.25 E3:0.25 A3:0.25 R:0.75 | E2:0.25 E3:0.25 G#3:0.25 R:0.75 |
     A2:0.25 E3:0.25 A3:0.25 R:0.75 | R:1.5 |
     A2:0.25 E3:0.25 A3:0.25 R:0.75 | E2:0.25 E3:0.25 G#3:0.25 R:0.75 | A2:0.25 E3:0.25 A3:1`,
  ),
  bachPrelude(),
];

export function songLength(s: Song): number {
  return Math.max(...s.notes.map((n) => n.start + n.dur));
}
