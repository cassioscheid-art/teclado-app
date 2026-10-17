export type NoteHandler = (midi: number, velocity: number) => void;

export interface MidiStatus {
  supported: boolean;
  devices: string[];
  error?: string;
}

/**
 * Entrada de notas: teclado MIDI (Web MIDI API) e, para testes,
 * o teclado do computador. O piano na tela chama os mesmos handlers.
 */
export class Input {
  onNoteOn: NoteHandler = () => {};
  onNoteOff: (midi: number) => void = () => {};
  onStatus: (s: MidiStatus) => void = () => {};
  status: MidiStatus = { supported: 'requestMIDIAccess' in navigator, devices: [] };
  octaveShift = 0;

  async connectMidi() {
    if (!this.status.supported) {
      this.onStatus(this.status);
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      const bind = () => {
        this.status.devices = [];
        access.inputs.forEach((input) => {
          this.status.devices.push(input.name || 'Teclado MIDI');
          input.onmidimessage = (e) => this.handleMessage(e.data);
        });
        this.onStatus(this.status);
      };
      access.onstatechange = bind;
      bind();
    } catch (err) {
      this.status.error = String(err);
      this.onStatus(this.status);
    }
  }

  handleMessage(data: Uint8Array | null) {
    if (!data || data.length < 3) return;
    const cmd = data[0] & 0xf0;
    const [, note, vel] = data;
    if (cmd === 0x90 && vel > 0) this.onNoteOn(note, vel / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) this.onNoteOff(note);
  }

  /** A W S E D F T G Y H U J K = Dó4 até Dó5. Z/X mudam a oitava. */
  bindComputerKeyboard() {
    const keys = 'awsedftgyhujkolp;';
    const down = new Set<string>();
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'z') this.octaveShift--;
      if (k === 'x') this.octaveShift++;
      const i = keys.indexOf(k);
      if (i < 0 || down.has(k)) return;
      down.add(k);
      this.onNoteOn(60 + i + this.octaveShift * 12, 0.8);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      const i = keys.indexOf(k);
      if (i < 0) return;
      down.delete(k);
      this.onNoteOff(60 + i + this.octaveShift * 12);
    });
  }
}
