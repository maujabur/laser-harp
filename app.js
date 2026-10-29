// ---------------------------------------------------------------------------
// Configuração (fácil de ajustar)
// ---------------------------------------------------------------------------

// 1. Tabela de NOTAS — a escala tocada, da mais grave para a mais aguda.
//    Ajuste aqui para mudar a afinação sem mexer nas teclas físicas.
const NOTES = [
  'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2',
  'C3', 'D3', 'E3', 'F3', 'G3'
];

// 2. Tabela de TECLAS físicas — o código do teclado (event.code) e o rótulo
//    mostrado na tela, na mesma ordem das notas acima.
const KEYS = [
  { code: 'KeyZ',   label: 'Z' },
  { code: 'KeyX',   label: 'X' },
  { code: 'KeyC',   label: 'C' },
  { code: 'KeyV',   label: 'V' },
  { code: 'KeyB',   label: 'B' },
  { code: 'KeyN',   label: 'N' },
  { code: 'KeyM',   label: 'M' },
  { code: 'Comma',  label: ',' },
  { code: 'Period', label: '.' },
  { code: 'Slash',  label: '/' },
  { code: 'KeyA',   label: 'A' },
  { code: 'KeyS',   label: 'S' }
];

// ---------------------------------------------------------------------------
// Mapa final — índices genéricos (0, 1, 2, ...) combinando teclas + notas.
// KEY_MAP[i] = { code, label, note }
// ---------------------------------------------------------------------------
const KEY_MAP = KEYS.map((key, i) => ({
  code: key.code,
  label: key.label,
  note: NOTES[i]
}));

// Busca rápida por código de tecla física -> índice no KEY_MAP.
const CODE_TO_INDEX = new Map(KEY_MAP.map((entry, i) => [entry.code, i]));

// ---------------------------------------------------------------------------
// Preset 46 (Synthex "Laser Harp") — parâmetros do timbre.
//
// Modelagem: a harpa laser do Synthex usa DOIS osciladores.
//   OSC1 (master): fica fixo na nota tocada (a fundamental da harpa).
//   OSC2 (slave):  afinado bem acima (2 oitavas + 7 semitons) e com um
//                  "pitch sweep" no ataque, o que rasga os harmônicos e
//                  produz o característico "poinnn poinnn".
// Como Tone.js não tem Hard Sync nativo, aproximamos o efeito com o sweep
// de pitch do OSC2 + PWM (pulse width) modulado por um LFO triangular lento.
// ---------------------------------------------------------------------------
const PRESET = {
  // Intervalo do OSC2 acima da nota tocada, em semitons (2 oitavas + 7 = 31).
  osc2Semitones: 31,

  // "Pitch sweep" do OSC2: de quantos semitons ele parte ACIMA do alvo e
  // quanto tempo leva para assentar. É o coração do "poinnn".
  osc2SweepSemitones: 7,
  osc2SweepTime: 0.12,     // segundos (o glide descendente do OSC2)

  // Mistura dos dois osciladores (ganho relativo).
  osc1Level: 0.55,
  osc2Level: 0.32,

  // Largura de pulso base de cada oscilador (0 = onda quadrada pura).
  osc1Width: 0.1,
  osc2Width: -0.2,

  // LFO triangular modulando a largura de pulso do OSC2 (tremor analógico).
  pwmLfoRate: 1.5,         // Hz — lento
  pwmLfoDepth: 0.25,       // profundidade da variação de width

  // Envelope de amplitude (compartilhado pelos dois osciladores da voz).
  envelope: { attack: 0.01, decay: 0.4, sustain: 0.55, release: 0.5 },

  // Portamento (glide) global entre notas, em segundos.
  portamento: 0.115,

  // Cadeia de efeitos.
  filter:  { frequency: 1650, Q: 2 },
  chorus:  { frequency: 1.2, delayTime: 4.5, depth: 0.8, wet: 0.15 },
  reverb:  { decay: 3.2, wet: 0.34 }
};

// ---------------------------------------------------------------------------
// Voz dual-oscilador. Cada voz é alocada a uma nota enquanto ela soa.
// ---------------------------------------------------------------------------
class LaserVoice {
  constructor(destination) {
    // Envelope de amplitude compartilhado -> destino (filtro).
    this.amp = new Tone.AmplitudeEnvelope(PRESET.envelope).connect(destination);

    // OSC1: a fundamental (fica na nota tocada).
    this.osc1 = new Tone.PulseOscillator({
      frequency: 440,
      width: PRESET.osc1Width
    });
    this.gain1 = new Tone.Gain(PRESET.osc1Level);
    this.osc1.connect(this.gain1);
    this.gain1.connect(this.amp);

    // OSC2: afinado bem acima, com pitch sweep no ataque (o "poinnn").
    this.osc2 = new Tone.PulseOscillator({
      frequency: 440,
      width: PRESET.osc2Width
    });
    this.gain2 = new Tone.Gain(PRESET.osc2Level);
    this.osc2.connect(this.gain2);
    this.gain2.connect(this.amp);

    // LFO triangular modulando a largura de pulso do OSC2 (tremor constante).
    this.pwmLfo = new Tone.LFO({
      type: 'triangle',
      frequency: PRESET.pwmLfoRate,
      min: PRESET.osc2Width - PRESET.pwmLfoDepth,
      max: PRESET.osc2Width + PRESET.pwmLfoDepth
    });
    this.pwmLfo.connect(this.osc2.width);

    this.osc1.start();
    this.osc2.start();
    this.pwmLfo.start();

    // Parâmetros ajustáveis em tempo real (valem a partir da próxima nota).
    this.portamento = PRESET.portamento;
    this.osc2Semitones = PRESET.osc2Semitones;
    this.sweepSemitones = PRESET.osc2SweepSemitones;
    this.sweepTime = PRESET.osc2SweepTime;

    this.busy = false;   // true enquanto a voz estiver tocando uma nota
    this.note = null;
  }

  // Dispara a nota. OSC1 vai direto; OSC2 pula acima e desce (sweep).
  attack(note, time = Tone.now()) {
    this.busy = true;
    this.note = note;

    const f1 = Tone.Frequency(note).toFrequency();
    const f2Target = Tone.Frequency(note)
      .transpose(this.osc2Semitones)
      .toFrequency();
    const f2Start = Tone.Frequency(note)
      .transpose(this.osc2Semitones + this.sweepSemitones)
      .toFrequency();

    // OSC1: glide suave até a fundamental.
    this.osc1.frequency.setValueAtTime(this.osc1.frequency.value, time);
    this.osc1.frequency.exponentialRampToValueAtTime(
      f1, time + this.portamento
    );

    // OSC2: começa acima do alvo e "escorrega" para baixo => poinnn.
    this.osc2.frequency.setValueAtTime(f2Start, time);
    this.osc2.frequency.exponentialRampToValueAtTime(
      f2Target, time + this.sweepTime
    );

    this.amp.triggerAttack(time);
  }

  release(time = Tone.now()) {
    this.amp.triggerRelease(time);
    // Libera a voz um pouco depois do fim do release.
    this.busy = false;
  }

  setPortamento(seconds) {
    this.portamento = seconds;
  }

  setSweepSemitones(semitones) {
    this.sweepSemitones = semitones;
  }

  setSweepTime(seconds) {
    this.sweepTime = seconds;
  }

  // Ajusta o ganho do OSC2 na mistura (0 a 1). Suave para evitar estalos.
  setOsc2Level(level) {
    this.gain2.gain.rampTo(level, 0.05);
  }

  dispose() {
    this.osc1.dispose();
    this.osc2.dispose();
    this.gain1.dispose();
    this.gain2.dispose();
    this.pwmLfo.dispose();
    this.amp.dispose();
  }
}

// ---------------------------------------------------------------------------
// Gerenciador poligônico simples: uma voz por nota tocada.
// ---------------------------------------------------------------------------
class LaserHarp {
  constructor(destination, polyphony = 12) {
    this.voices = [];
    for (let i = 0; i < polyphony; i++) {
      this.voices.push(new LaserVoice(destination));
    }
    this.active = new Map(); // note -> voice
  }

  triggerAttack(note) {
    if (this.active.has(note)) return;
    const voice = this.voices.find((v) => !v.busy);
    if (!voice) return; // sem vozes livres (polifonia esgotada)
    voice.attack(note);
    this.active.set(note, voice);
  }

  triggerRelease(note) {
    const voice = this.active.get(note);
    if (!voice) return;
    voice.release();
    this.active.delete(note);
  }

  setPortamento(seconds) {
    this.voices.forEach((v) => v.setPortamento(seconds));
  }

  setSweepSemitones(semitones) {
    this.voices.forEach((v) => v.setSweepSemitones(semitones));
  }

  setSweepTime(seconds) {
    this.voices.forEach((v) => v.setSweepTime(seconds));
  }

  setOsc2Level(level) {
    this.voices.forEach((v) => v.setOsc2Level(level));
  }
}

let isStarted = false;
let isStarting = false;
let harp, filter, chorus, reverb;
const activeKeys = new Set();
const activePointers = new Map(); // pointerId -> note index
let audioInitPromise = null;


// UI: Renderizar teclas
const keysContainer = document.getElementById('keyboard');
KEY_MAP.forEach((data, index) => {
  const el = document.createElement('div');
  el.className = 'key-box';
  el.id = `key-${index}`;
  el.innerHTML = `
    <div class="key-label">${data.label}</div>
    <div class="note-label">${data.note}</div>
  `;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `Tocar nota ${data.note}`);
  el.addEventListener('pointerdown', async (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, index);
    try {
      await ensureAudio();
      if (activePointers.get(e.pointerId) === index) updateNote(index);
    } catch (error) { console.error('Falha ao iniciar áudio:', error); }
  });
  const releasePointer = (e) => {
    if (!activePointers.has(e.pointerId)) return;
    const heldIndex = activePointers.get(e.pointerId);
    activePointers.delete(e.pointerId);
    updateNote(heldIndex);
  };
  el.addEventListener('pointerup', releasePointer);
  el.addEventListener('pointercancel', releasePointer);
  el.addEventListener('lostpointercapture', releasePointer);
  keysContainer.appendChild(el);
});

// Inicialização do Áudio.
// O navegador só permite iniciar o AudioContext a partir de um gesto do
// usuário, então chamamos isto na primeira tecla pressionada. Essa primeira
// tecla serve de "destravamento" e normalmente ainda não soa; da segunda
// em diante o som sai normal.
async function initAudio() {
  if (isStarted) return;
  isStarting = true;

  await Tone.start();
  Tone.context.latencyHint = 'interactive';

  // --- EFEITOS E FILTRO ---
  reverb = new Tone.Reverb({
    decay: PRESET.reverb.decay,
    wet: PRESET.reverb.wet
  }).toDestination();

  // Chorus modo 1 do Synthex (frequência baixa, profundidade alta).
  chorus = new Tone.Chorus({
    frequency: PRESET.chorus.frequency,
    delayTime: PRESET.chorus.delayTime,
    depth: PRESET.chorus.depth,
    wet: PRESET.chorus.wet
  }).connect(reverb).start();

  // Filtro Low-Pass 24 dB/oct.
  filter = new Tone.Filter({
    frequency: PRESET.filter.frequency,
    type: 'lowpass',
    rolloff: -24,
    Q: PRESET.filter.Q
  }).connect(chorus);

  // Instrumento dual-oscilador (modelagem Preset 46 Synthex).
  harp = new LaserHarp(filter, 12);

  document.getElementById('controls').style.display = 'grid';
  document.getElementById('controls-details').style.display = 'block';
  isStarted = true;
  isStarting = false;

  bindControls();
}

function bindControls() {
  // Glide Speed
  document.getElementById('ctrl-glide').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-glide').innerText = val;
    harp.setPortamento(val / 1000);
  });

  // Cutoff
  document.getElementById('ctrl-cutoff').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-cutoff').innerText = val;
    filter.frequency.rampTo(val, 0.05);
  });

  // Ressonância (Q)
  document.getElementById('ctrl-res').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-res').innerText = val;
    filter.Q.rampTo(val, 0.05);
  });

  // Reverb
  document.getElementById('ctrl-reverb').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-reverb').innerText = `${Math.round(val * 100)}%`;
    reverb.wet.rampTo(val, 0.05);
  });

  // Chorus
  document.getElementById('ctrl-chorus').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-chorus').innerText = `${Math.round(val * 100)}%`;
    chorus.wet.rampTo(val, 0.05);
  });

  // Sweep OSC2 — intensidade do "poinnn" (vale da próxima nota em diante)
  document.getElementById('ctrl-sweep').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-sweep').innerText = val;
    harp.setSweepSemitones(val);
  });

  // Sweep OSC2 — tempo do "poinnn" (ms -> segundos)
  document.getElementById('ctrl-sweeptime').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-sweeptime').innerText = val;
    harp.setSweepTime(val / 1000);
  });

  // Mix OSC2 — presença do segundo oscilador
  document.getElementById('ctrl-osc2').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-osc2').innerText = `${Math.round(val * 100)}%`;
    harp.setOsc2Level(val);
  });
}

// Compartilha as mesmas notas entre teclado físico e superfícies de toque.
function updateNote(index) {
  if (!isStarted) return;
  const held = activeKeys.has(index) || [...activePointers.values()].includes(index);
  const note = KEY_MAP[index].note;
  const el = document.getElementById(`key-${index}`);
  if (held) harp.triggerAttack(note);
  else harp.triggerRelease(note);
  if (el) el.classList.toggle('active', held);
}

function ensureAudio() {
  if (isStarted) return Promise.resolve();
  if (!audioInitPromise) {
    audioInitPromise = initAudio().catch(error => {
      isStarting = false;
      audioInitPromise = null;
      throw error;
    });
  }
  return audioInitPromise;
}

window.addEventListener('keydown', async (e) => {
  if (e.repeat) return;
  const index = CODE_TO_INDEX.get(e.code);
  if (index === undefined) return;
  e.preventDefault();
  activeKeys.add(index);
  try {
    await ensureAudio();
    if (activeKeys.has(index)) updateNote(index);
  } catch (error) { console.error('Falha ao iniciar áudio:', error); }
});

window.addEventListener('keyup', (e) => {
  const index = CODE_TO_INDEX.get(e.code);
  if (index === undefined) return;
  e.preventDefault();
  activeKeys.delete(index);
  updateNote(index);
});

window.addEventListener('blur', () => {
  const held = new Set([...activeKeys, ...activePointers.values()]);
  activeKeys.clear();
  activePointers.clear();
  held.forEach(updateNote);
});
