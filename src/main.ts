import { Synth } from './audio';
import { Engine, HandMode } from './engine';
import { Input, MidiStatus } from './input';
import { Renderer } from './render';
import { Level, SONGS, Song } from './songs';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const synth = new Synth();
const input = new Input();
let engine: Engine | null = null;
let renderer: Renderer | null = null;
let lastFrame = 0;
let lastClickBeat = -Infinity;
let soundOn = true;
let metronomeOn = false;

// ---------- Recordes salvos no aparelho ----------

function loadBest(id: string): number | null {
  try {
    const v = localStorage.getItem(`best:${id}`);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function saveBest(id: string, accuracy: number) {
  try {
    const prev = loadBest(id);
    if (prev === null || accuracy > prev) localStorage.setItem(`best:${id}`, String(accuracy));
  } catch {
    /* armazenamento indisponível: ignora */
  }
}

// ---------- Biblioteca ----------

function renderLibrary() {
  const list = $('song-list');
  list.innerHTML = '';
  const levels: Level[] = ['Fácil', 'Médio', 'Difícil'];
  for (const level of levels) {
    const section = document.createElement('div');
    section.className = 'level';
    section.innerHTML = `<h2>${level}</h2><div class="songs"></div>`;
    const grid = section.querySelector('.songs')!;
    for (const s of SONGS.filter((x) => x.level === level)) {
      const best = loadBest(s.id);
      const card = document.createElement('button');
      card.className = 'song-card';
      card.innerHTML = `<strong>${s.title}</strong><small>${s.composer}</small>${
        best !== null ? `<span class="best">Recorde: ${best}%</span>` : ''
      }`;
      card.onclick = () => openSong(s);
      grid.appendChild(card);
    }
    list.appendChild(section);
  }
}

function showMidiStatus(s: MidiStatus) {
  const el = $('midi-status');
  el.classList.toggle('ok', s.devices.length > 0);
  if (!s.supported) {
    el.innerHTML =
      'Este navegador não tem acesso a MIDI (o Safari do iPhone/iPad não suporta). ' +
      'No iOS, abra este endereço no app gratuito <b>Web MIDI Browser</b>. ' +
      'Enquanto isso, dá para praticar tocando nas teclas da tela.';
  } else if (s.error) {
    el.textContent = `Não foi possível acessar o MIDI: ${s.error}`;
  } else if (s.devices.length) {
    el.textContent = `✓ Conectado: ${s.devices.join(', ')}`;
  } else {
    el.textContent = 'Nenhum teclado MIDI encontrado. Conecte por cabo USB ou Bluetooth MIDI.';
  }
}

// ---------- Prática ----------

function openSong(song: Song) {
  synth.unlock();
  $('library').classList.add('hidden');
  $('practice').classList.remove('hidden');
  $('song-title').textContent = song.title;
  $('song-meta').textContent = `${song.composer} · ${song.level} · ${song.bpm} bpm`;

  const prev = engine?.settings;
  engine = new Engine(song);
  if (prev) engine.settings = { ...prev, loop: null };
  $<HTMLButtonElement>('loop-toggle').classList.remove('on');
  $<HTMLInputElement>('loop-to').value = String(Math.min(4, engine.barCount));
  $<HTMLInputElement>('loop-to').max = String(engine.barCount);
  $<HTMLInputElement>('loop-from').max = String(engine.barCount);

  const [low, high] = Renderer.rangeFor(song.notes.map((n) => n.midi));
  renderer = new Renderer($('canvas'), low, high);
  renderer.showNames = $<HTMLInputElement>('names').checked;

  engine.on((e) => {
    if (!renderer || !engine) return;
    if (e.type === 'hit') renderer.popup(e.grade === 'perfect' ? 'Perfeito!' : 'Bom', renderer.gradeColor(e.grade), e.note.midi);
    if (e.type === 'miss') renderer.popup('Perdeu', renderer.gradeColor('miss'), e.note.midi);
    if (e.type === 'wrong') renderer.popup('Nota errada', renderer.gradeColor('miss'), e.midi);
    if (e.type === 'auto') synth.noteOn(e.note.midi, 0.45, e.note.dur * engine.secondsPerBeat);
    if (e.type === 'end') showResult();
    updateStats();
  });

  engine.reset();
  $('overlay').classList.remove('hidden');
  $('result').classList.add('hidden');
  updateStats();
}

function start() {
  if (!engine) return;
  synth.unlock();
  if (engine.finished) engine.reset();
  $('overlay').classList.add('hidden');
  $('result').classList.add('hidden');
  engine.playing = true;
  $('pause').textContent = '❚❚';
}

function togglePause() {
  if (!engine) return;
  if (engine.playing) {
    engine.playing = false;
    $('pause').textContent = '▶';
  } else start();
}

function updateStats() {
  if (!engine) return;
  $('accuracy').textContent = `${engine.accuracy}%`;
  $('streak').textContent = String(engine.stats.streak);
}

function showResult() {
  if (!engine) return;
  const s = engine.stats;
  saveBest(engine.song.id, engine.accuracy);
  $('stars').textContent = '★'.repeat(engine.stars) + '☆'.repeat(3 - engine.stars);
  $('result-title').textContent =
    engine.stars === 3 ? 'Mandou muito bem!' : engine.stars === 2 ? 'Muito bom!' : 'Continue praticando!';
  $('result-detail').textContent =
    `Precisão ${engine.accuracy}% · ${s.perfect} perfeitas · ${s.good} boas · ${s.miss} perdidas · ` +
    `${s.wrong} erradas · melhor sequência ${s.bestStreak}`;
  $('result').classList.remove('hidden');
}

function frame(t: number) {
  const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.1) : 0;
  lastFrame = t;
  if (engine && renderer && !$('practice').classList.contains('hidden')) {
    const before = engine.beat;
    engine.update(dt);
    if (metronomeOn && engine.playing) {
      const b = Math.floor(engine.beat);
      if (b > Math.floor(before) && b !== lastClickBeat && b >= 0) {
        lastClickBeat = b;
        synth.click(b % engine.song.beatsPerBar === 0);
      }
    }
    renderer.draw(engine);
    $<HTMLInputElement>('progress').value = String(Math.round((Math.max(0, engine.beat) / engine.length) * 1000));
  }
  requestAnimationFrame(frame);
}

// ---------- Notas tocadas ----------

input.onNoteOn = (midi, velocity) => {
  if (soundOn) synth.noteOn(midi, velocity);
  if (!engine || !renderer) return;
  const result = engine.noteOn(midi);
  renderer.pressed.set(midi, result === 'wrong' ? '#ff8a96' : renderer.gradeColor(result));
  updateStats();
};

input.onNoteOff = (midi) => {
  synth.noteOff(midi);
  renderer?.pressed.delete(midi);
};

input.onStatus = showMidiStatus;

// Piano na tela (toque ou mouse), com vários dedos ao mesmo tempo.
const touches = new Map<number, number>();
const canvas = $<HTMLCanvasElement>('canvas');
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const midi = renderer?.keyAt(e.clientX - rect.left, e.clientY - rect.top);
  if (midi == null) return;
  synth.unlock();
  touches.set(e.pointerId, midi);
  input.onNoteOn(midi, 0.8);
});
const release = (e: PointerEvent) => {
  const midi = touches.get(e.pointerId);
  if (midi === undefined) return;
  touches.delete(e.pointerId);
  input.onNoteOff(midi);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// ---------- Controles ----------

$('play').onclick = start;
$('pause').onclick = togglePause;
$('again').onclick = () => {
  engine?.reset();
  start();
};
$('restart').onclick = () => {
  engine?.reset();
  start();
};
const goLibrary = () => {
  if (engine) engine.playing = false;
  $('practice').classList.add('hidden');
  $('library').classList.remove('hidden');
  renderLibrary();
};
$('back').onclick = goLibrary;
$('to-library').onclick = goLibrary;
$('toggle-tools').onclick = () => {
  $('tools').classList.toggle('open');
  requestAnimationFrame(() => renderer?.resize());
};

$<HTMLInputElement>('speed').oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  $('speed-label').textContent = `${v}%`;
  if (engine) engine.settings.speed = v / 100;
};

for (const b of $('hands').querySelectorAll<HTMLButtonElement>('button')) {
  b.onclick = () => {
    $('hands').querySelectorAll('button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    if (engine) engine.settings.hands = b.dataset.hand as HandMode;
  };
}

$<HTMLInputElement>('wait').onchange = (e) => {
  if (engine) engine.settings.waitMode = (e.target as HTMLInputElement).checked;
};
$<HTMLInputElement>('metronome').onchange = (e) => (metronomeOn = (e.target as HTMLInputElement).checked);
$<HTMLInputElement>('sound').onchange = (e) => (soundOn = (e.target as HTMLInputElement).checked);
$<HTMLInputElement>('names').onchange = (e) => {
  if (renderer) renderer.showNames = (e.target as HTMLInputElement).checked;
};

$('loop-toggle').onclick = () => {
  if (!engine) return;
  const btn = $('loop-toggle');
  if (engine.settings.loop) {
    engine.settings.loop = null;
    btn.classList.remove('on');
    btn.textContent = 'Ativar';
    return;
  }
  const from = Math.max(1, Number($<HTMLInputElement>('loop-from').value) || 1);
  const to = Math.max(from, Number($<HTMLInputElement>('loop-to').value) || from);
  engine.settings.loop = { from: from - 1, to: Math.min(to, engine.barCount) };
  engine.seek(engine.loopRange[0] - 1);
  btn.classList.add('on');
  btn.textContent = 'Desativar';
};

$<HTMLInputElement>('progress').oninput = (e) => {
  if (!engine) return;
  const v = Number((e.target as HTMLInputElement).value) / 1000;
  engine.seek(v * engine.length);
};

window.addEventListener('resize', () => renderer?.resize());

// ---------- Início ----------

renderLibrary();
input.bindComputerKeyboard();
void input.connectMidi();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('./sw.js');
}
