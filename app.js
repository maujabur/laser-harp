// ---------------------------------------------------------------------------
// Configuração (fácil de ajustar)
// ---------------------------------------------------------------------------

// 1. ESCALAS disponíveis — descritas por INTERVALOS em semitons dentro de
//    uma oitava (0 = a própria nota base). As 12 teclas são preenchidas
//    subindo: quando a escala acaba, continua na oitava seguinte.
//
//    O espírito aqui é "difícil tocar errado": as escalas padrão são
//    pentatônicas (sem semitons tensos), para que qualquer combinação de
//    notas soe bem mesmo para quem nunca tocou. As de 7 notas vêm como
//    tempero para quem quiser explorar.
const SCALES = [
  // Pentatônica menor em C2 = a afinação original da harpa (C Eb F G Bb ...),
  // apenas sem o G1 de pickup grave que a versão fixa tinha embaixo.
  { id: 'penta-menor',  label: 'Pentatônica Menor',  intervals: [0, 3, 5, 7, 10] },
  { id: 'penta-maior',  label: 'Pentatônica Maior',  intervals: [0, 2, 4, 7, 9] },
  { id: 'maior',        label: 'Maior (Jônio)',      intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'dorico',       label: 'Dórico',             intervals: [0, 2, 3, 5, 7, 9, 10] }
];

// 2. NOTAS BASE seguras — lista curta (em vez de slider cromático livre),
//    para que no festival nunca pare numa afinação esquisita. Cada uma é a
//    nota da PRIMEIRA tecla; as demais seguem a escala subindo.
const ROOT_NOTES = ['G1', 'A1', 'C2', 'D2', 'E2', 'G2', 'A2', 'C3', 'D3'];

const DEFAULT_SCALE_ID = 'penta-menor'; // reproduz a afinação original
const DEFAULT_ROOT = 'C2';              // 1ª nota da afinação original (C Eb F G Bb)

// O Tone.js exibe notas pretas com sustenido (D#); a estética da harpa usa
// bemol (Eb). Convertemos só o RÓTULO — a frequência é idêntica e o Tone.js
// aceita os dois nomes como entrada.
const SHARP_TO_FLAT = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
function toFlat(note) {
  return note.replace(/^([A-G]#)/, (_, pc) => SHARP_TO_FLAT[pc]);
}

// Gera as 12 notas a partir da nota base e dos intervalos da escala,
// subindo oitava a oitava. Reaproveita Tone.Frequency().transpose(), já
// usado no sweep do OSC2.
const KEY_COUNT = 12;
function buildNotes(rootNote, scaleIntervals) {
  const perOctave = scaleIntervals.length;
  const notes = [];
  for (let i = 0; i < KEY_COUNT; i++) {
    const octave = Math.floor(i / perOctave);
    const semitones = scaleIntervals[i % perOctave] + 12 * octave;
    notes.push(toFlat(Tone.Frequency(rootNote).transpose(semitones).toNote()));
  }
  return notes;
}

// 3. Tabela de TECLAS físicas — o código do teclado (event.code) e o rótulo
//    mostrado na tela, na mesma ordem das notas geradas acima.
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
// KEY_MAP[i] = { code, label, note }. As teclas físicas (code/label) são
// fixas; só a `note` muda quando o usuário troca de escala ou nota base.
// ---------------------------------------------------------------------------
let currentScaleId = DEFAULT_SCALE_ID;
let currentRoot = DEFAULT_ROOT;

function scaleById(id) {
  return SCALES.find(s => s.id === id) || SCALES[0];
}

const KEY_MAP = KEYS.map((key, i) => ({
  code: key.code,
  label: key.label,
  note: null // preenchido por applyScale()
}));

// Busca rápida por código de tecla física -> índice no KEY_MAP.
const CODE_TO_INDEX = new Map(KEY_MAP.map((entry, i) => [entry.code, i]));

// Recalcula as 12 notas e atualiza o KEY_MAP + os rótulos na tela, sem
// recriar as teclas (os listeners continuam válidos).
function applyScale(rootNote = currentRoot, scaleId = currentScaleId) {
  currentRoot = rootNote;
  currentScaleId = scaleId;
  const notes = buildNotes(rootNote, scaleById(scaleId).intervals);
  KEY_MAP.forEach((entry, i) => {
    entry.note = notes[i];
    const el = document.getElementById(`key-${i}`);
    if (el) {
      const noteLabel = el.querySelector('.note-label');
      if (noteLabel) noteLabel.textContent = notes[i];
    }
  });
}

// Preenche as notas iniciais antes de qualquer render (sem DOM ainda).
applyScale();

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
  osc2SweepSemitones: 1,
  osc2SweepTime: 0.04,     // segundos (o glide descendente do OSC2)

  // Mistura dos dois osciladores (ganho relativo).
  osc1Level: 0.55,
  osc2Level: 0.26,

  // Forma de onda de cada oscilador. 'pulse' mantém o PWM (width + LFO); as
  // demais (sawtooth/square/triangle/sine) ignoram o width.
  osc1Type: 'pulse',
  osc2Type: 'pulse',

  // Largura de pulso base de cada oscilador (0 = onda quadrada pura).
  // Só tem efeito quando o tipo é 'pulse'.
  osc1Width: 0.1,
  osc2Width: -0.2,

  // LFO triangular modulando a largura de pulso do OSC2 (tremor analógico).
  pwmLfoRate: 1.5,         // Hz — lento
  pwmLfoDepth: 0.25,       // profundidade da variação de width

  // Envelope de amplitude (compartilhado pelos dois osciladores da voz).
  envelope: { attack: 0.01, decay: 0.4, sustain: 0.55, release: 0.5 },

  // Portamento (glide) global entre notas, em segundos.
  portamento: 0.035,

  // Filtro com KEY TRACKING: o cutoff acompanha a nota tocada, por voz.
  //   keyTrack = múltiplo da frequência da nota (1.0 = cutoff na própria
  //   fundamental; 2.0 = uma oitava acima; 4.0 = duas oitavas acima).
  // Assim graves e agudas têm o mesmo brilho relativo, e mudar a nota base
  // não altera o timbre. Q é a ressonância.
  filter:  { keyTrack: 4.0, Q: 3.6 },

  // Cadeia de efeitos (reverb removido para aliviar o Raspberry Pi).
  chorus:  { frequency: 1.2, delayTime: 4.5, depth: 0.8, wet: 0.05 }
};

// ---------------------------------------------------------------------------
// PRESETS DE FÁBRICA ("vibes"). Cada um guarda a experiência toda: timbre +
// afinação (escala e nota base). O volume fica de fora (é do ambiente/PA).
// Os valores estão nas MESMAS unidades dos sliders (ms, fator ×nota, %, etc.),
// então aplicar um preset é só setar cada controle e reaproveitar os handlers.
// Campos por preset:
//   glide(ms) cutoff(×nota) res(Q) chorus(0-1) sweep(semi) sweeptime(ms)
//   osc2(0-1) attack(ms) decay(ms) sustain(0-1) release(ms) scale root
// ---------------------------------------------------------------------------
const FACTORY_PRESETS = [
  {
    id: 'harpa-classica', label: 'Harpa Clássica',
    wave1: 'pulse', wave2: 'pulse',
    glide: 35, cutoff: 4.0, res: 3.6, chorus: 0.05, interval: 31, sweep: 1, sweeptime: 40,
    osc2: 0.26, attack: 10, decay: 400, sustain: 0.55, release: 500,
    scale: 'penta-menor', root: 'C2'
  },
  {
    id: 'pad-etereo', label: 'Pad Etéreo',
    wave1: 'sawtooth', wave2: 'triangle',
    glide: 120, cutoff: 3.2, res: 1.5, chorus: 0.35, interval: 12, sweep: 0.5, sweeptime: 80,
    osc2: 0.4, attack: 600, decay: 800, sustain: 0.8, release: 1800,
    scale: 'penta-maior', root: 'C2'
  },
  {
    id: 'pluck-curto', label: 'Pluck Curto',
    wave1: 'square', wave2: 'pulse',
    glide: 10, cutoff: 5.5, res: 2.5, chorus: 0.08, interval: 19, sweep: 2, sweeptime: 30,
    osc2: 0.3, attack: 3, decay: 220, sustain: 0.0, release: 180,
    scale: 'penta-menor', root: 'D2'
  },
  {
    id: 'drone-profundo', label: 'Drone Profundo',
    wave1: 'sawtooth', wave2: 'sawtooth',
    glide: 90, cutoff: 3.2, res: 4.5, chorus: 0.2, interval: 12, sweep: 1, sweeptime: 60,
    osc2: 0.5, attack: 200, decay: 600, sustain: 0.9, release: 1400,
    scale: 'penta-menor', root: 'G1'
  },
  {
    id: 'sino-cristalino', label: 'Sino Cristalino',
    wave1: 'sine', wave2: 'triangle',
    glide: 15, cutoff: 7.0, res: 1.0, chorus: 0.12, interval: 24, sweep: 0.5, sweeptime: 40,
    osc2: 0.35, attack: 4, decay: 900, sustain: 0.15, release: 700,
    scale: 'penta-maior', root: 'G2'
  },
  {
    // Capturado da vibe "Oriental" do usuário (senoide + pulse, filtro bem
    // aberto, OSC2 agudo). Preservado como preset de fábrica.
    id: 'oriental', label: 'Oriental',
    wave1: 'sine', wave2: 'pulse',
    glide: 35, cutoff: 8.0, res: 3.6, chorus: 0.05, interval: 31, sweep: 0, sweeptime: 40,
    osc2: 1.0, attack: 10, decay: 400, sustain: 0.55, release: 500,
    scale: 'penta-menor', root: 'C2'
  }
];
const DEFAULT_PRESET_ID = 'harpa-classica';

// ---------------------------------------------------------------------------
// Voz dual-oscilador. Cada voz é alocada a uma nota enquanto ela soa.
// ---------------------------------------------------------------------------
class LaserVoice {
  constructor(destination, pwmLfo) {
    // Compensação de ganho do filtro: quanto mais o filtro fecha (keyTrack
    // baixo), mais energia de harmônicos se perde e mais baixo fica o som.
    // Este ganho recupera parte dessa perda, para mudar o brilho não derrubar
    // tanto o volume. Fica DEPOIS do filtro, antes do destino.
    this.comp = new Tone.Gain(1).connect(destination);

    // Filtro low-pass POR VOZ (12 dB/oct). Seu cutoff acompanha a nota tocada
    // (key tracking), calculado no attack. Fica entre o envelope e a compensação.
    this.filter = new Tone.Filter({
      frequency: 1000,          // placeholder; definido por nota no attack
      type: 'lowpass',
      rolloff: -12,
      Q: PRESET.filter.Q
    }).connect(this.comp);

    // Envelope de amplitude compartilhado -> filtro da voz.
    this.amp = new Tone.AmplitudeEnvelope(PRESET.envelope).connect(this.filter);

    // Guarda o LFO de PWM para (re)conectar só quando um oscilador é 'pulse'.
    this.pwmLfo = pwmLfo;
    this.pwmConnected = false;

    // OSC1: a fundamental (fica na nota tocada). OmniOscillator permite trocar
    // a forma de onda (sawtooth/square/triangle/sine/pulse) para dar caráter.
    this.osc1 = new Tone.OmniOscillator({
      frequency: 440,
      type: PRESET.osc1Type,
      width: PRESET.osc1Width
    });
    this.gain1 = new Tone.Gain(PRESET.osc1Level);
    this.osc1.connect(this.gain1);
    this.gain1.connect(this.amp);

    // OSC2: afinado bem acima, com pitch sweep no ataque (o "poinnn").
    this.osc2 = new Tone.OmniOscillator({
      frequency: 440,
      type: PRESET.osc2Type,
      width: PRESET.osc2Width
    });
    this.gain2 = new Tone.Gain(PRESET.osc2Level);
    this.osc2.connect(this.gain2);
    this.gain2.connect(this.amp);

    this.osc1.start();
    this.osc2.start();

    // Conecta o LFO de PWM ao OSC2 só se ele for 'pulse' (as outras ondas não
    // têm width). Todas as vozes compartilham o mesmo LFO (leve para o Pi).
    this.updatePwm();

    // Parâmetros ajustáveis em tempo real (valem a partir da próxima nota).
    this.portamento = PRESET.portamento;
    this.osc2Semitones = PRESET.osc2Semitones;
    this.sweepSemitones = PRESET.osc2SweepSemitones;
    this.sweepTime = PRESET.osc2SweepTime;
    this.filterKeyTrack = PRESET.filter.keyTrack; // múltiplo da freq. da nota

    this.busy = false;
    this.note = null;
    this.releasing = false;
    this.availableAt = 0;
    this.startedAt = 0;
  }

  // Dispara a nota. OSC1 vai direto; OSC2 pula acima e desce (sweep).
  attack(note, time = Tone.now()) {
    this.busy = true;
    this.releasing = false;
    this.availableAt = Infinity;
    this.startedAt = time;
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

    // Filtro (key tracking): cutoff = fator × frequência da nota. Desliza
    // junto com o glide. Clamp num teto seguro para não passar do Nyquist
    // em notas agudas com fator alto.
    const cutoff = Math.min(18000, Math.max(20, this.filterKeyTrack * f1));
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, time);
    this.filter.frequency.exponentialRampToValueAtTime(
      cutoff, time + this.portamento
    );

    // Compensação de ganho desliza junto com o filtro.
    const comp = filterCompensation(this.filterKeyTrack);
    this.comp.gain.setValueAtTime(this.comp.gain.value, time);
    this.comp.gain.linearRampToValueAtTime(comp, time + this.portamento);

    this.amp.triggerAttack(time);
  }

  release(time = Tone.now()) {
    this.amp.triggerRelease(time);
    // A voz continua reservada até o envelope terminar. Usa o release ATUAL
    // do envelope (pode ter sido ajustado em runtime) e não o valor fixo do
    // preset, para não cortar o rabo da nota quando o release é aumentado.
    this.releasing = true;
    this.availableAt = time + Number(this.amp.release);
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

  // Intervalo base do OSC2 acima da nota (semitons). Vale da próxima nota.
  setOsc2Semitones(semitones) {
    this.osc2Semitones = semitones;
  }

  // Ajusta o ganho do OSC2 na mistura (0 a 1). Suave para evitar estalos.
  setOsc2Level(level) {
    this.gain2.gain.rampTo(level, 0.05);
  }

  // (Re)conecta o LFO de PWM ao width do OSC2 apenas quando ele tem width
  // (ou seja, é 'pulse'). As outras ondas não têm width. Checamos a existência
  // do Signal width em vez de confiar na string do tipo — mais robusto.
  updatePwm() {
    const w = this.osc2.width; // Signal só existe no modo pulse
    if (w && !this.pwmConnected) {
      try { this.pwmLfo.connect(w); this.pwmConnected = true; } catch { /* sem width */ }
    } else if (!w && this.pwmConnected) {
      this.pwmConnected = false; // width sumiu ao trocar de onda; nada a desconectar
    }
  }

  // Troca a forma de onda de um oscilador ('osc1' ou 'osc2'). Reaplica width
  // quando o novo tipo é 'pulse' e ajusta o PWM do OSC2.
  setWaveform(which, type) {
    const osc = which === 'osc2' ? this.osc2 : this.osc1;
    if (which === 'osc2' && this.pwmConnected) {
      // Desconecta o PWM antes de trocar (o width vai deixar de existir).
      try { this.pwmLfo.disconnect(this.osc2.width); } catch { /* ok */ }
      this.pwmConnected = false;
    }
    osc.type = type;
    if (osc.width) {
      osc.width.value = (which === 'osc2' ? PRESET.osc2Width : PRESET.osc1Width);
    }
    if (which === 'osc2') this.updatePwm();
  }

  // Fator de key tracking do filtro (vale da próxima nota em diante).
  setFilterKeyTrack(factor) {
    this.filterKeyTrack = factor;
  }

  // Ressonância do filtro (aplicada imediatamente a esta voz).
  setFilterQ(q) {
    this.filter.Q.rampTo(q, 0.05);
  }

  dispose() {
    this.osc1.dispose();
    this.osc2.dispose();
    this.gain1.dispose();
    this.gain2.dispose();
    this.filter.dispose();
    this.comp.dispose();
    this.amp.dispose();
  }
}

// Ganho de compensação do filtro a partir do fator de key tracking. Neutro
// (1.0) quando o filtro está aberto (keyTrack >= REF); sobe suavemente quando
// fecha, para recuperar a energia perdida. Curva logarítmica (expoente < 1) e
// teto para não estourar. Calibrado empiricamente.
function filterCompensation(keyTrack) {
  const REF = 4.0;      // ponto de ganho neutro (o default)
  const CEILING = 2.6;  // compensação máxima
  if (keyTrack >= REF) return 1.0;
  const comp = Math.pow(REF / keyTrack, 0.6);
  return Math.min(CEILING, comp);
}

// ---------------------------------------------------------------------------
// Pool de vozes: notas e polifonia são independentes.
// Vozes em release só ficam livres após o envelope terminar.
// ---------------------------------------------------------------------------
class LaserHarp {
  constructor(destination, pwmLfo, polyphony = 12) {
    this.voices = Array.from({ length: polyphony }, () => new LaserVoice(destination, pwmLfo));
    this.active = new Map(); // nota pressionada -> voz
  }

  triggerAttack(note) {
    if (this.active.has(note)) return;
    const now = Tone.now();
    // Recupera vozes cujo release já terminou (sem timers no áudio).
    for (const voice of this.voices) {
      if (voice.releasing && voice.availableAt <= now) {
        voice.busy = false;
        voice.releasing = false;
        voice.note = null;
      }
    }

    let voice = this.voices.find(v => !v.busy);
    let attackAt = now;
    if (!voice) {
      // Prioriza o release mais antigo; só rouba nota sustentada em último caso.
      voice = this.voices.filter(v => v.releasing)
        .sort((a, b) => a.availableAt - b.availableAt)[0];
      if (!voice) {
        voice = this.voices.reduce((oldest, v) =>
          v.startedAt < oldest.startedAt ? v : oldest);
        // Remove o vínculo anterior para que o keyup antigo não corte a nova nota.
        if (this.active.get(voice.note) === voice) this.active.delete(voice.note);
      }
      // Transição curta para evitar descontinuidade no envelope reutilizado.
      voice.amp.triggerRelease(now);
      attackAt = now + 0.012;
    }
    voice.attack(note, attackAt);
    this.active.set(note, voice);
  }

  triggerRelease(note) {
    const voice = this.active.get(note);
    if (!voice) return;
    voice.release();
    this.active.delete(note);
  }

  setPortamento(seconds) {
    this.voices.forEach(v => v.setPortamento(seconds));
  }

  setSweepSemitones(semitones) {
    this.voices.forEach(v => v.setSweepSemitones(semitones));
  }

  setOsc2Semitones(semitones) {
    this.voices.forEach(v => v.setOsc2Semitones(semitones));
  }

  setSweepTime(seconds) {
    this.voices.forEach(v => v.setSweepTime(seconds));
  }

  setOsc2Level(level) {
    this.voices.forEach(v => v.setOsc2Level(level));
  }

  setFilterKeyTrack(factor) {
    this.voices.forEach(v => v.setFilterKeyTrack(factor));
  }

  setFilterQ(q) {
    this.voices.forEach(v => v.setFilterQ(q));
  }

  setWaveform(which, type) {
    this.voices.forEach(v => v.setWaveform(which, type));
  }

  setEnvelope(param, value) {
    this.voices.forEach(v => { v.amp[param] = value; });
  }
}

let isStarted = false;
let isStarting = false;
let harp, chorus, inputGain, masterGain, pwmLfo;
const VOLUME_KEY = 'laser-harp-master-volume-v1';
const USER_PRESETS_KEY = 'laser-harp-user-presets-v1';
const WORKSTATE_KEY = 'laser-harp-workstate-v1'; // última config (save geral)
// Versão do FORMATO da vibe (metadado, não som). Serve para migrar arquivos
// antigos no futuro, se a estrutura mudar. Não entra na comparação de vibes.
const VIBE_VERSION = 1;
// Mapa campo-do-preset -> id-do-slider. No topo porque applyWorkState (no
// setup) o usa antes de o código de presets aparecer no arquivo (const tem
// temporal dead zone, diferente de function).
const PRESET_SLIDER = {
  glide: 'ctrl-glide', cutoff: 'ctrl-cutoff', res: 'ctrl-res',
  chorus: 'ctrl-chorus', sweep: 'ctrl-sweep', sweeptime: 'ctrl-sweeptime',
  interval: 'ctrl-interval', osc2: 'ctrl-osc2', attack: 'ctrl-attack',
  decay: 'ctrl-decay', sustain: 'ctrl-sustain', release: 'ctrl-release'
};
// Entrada especial "✎ Não salvo" e o preset REAL selecionado. No topo porque o
// setup os usa antes de o código de presets aparecer no arquivo (TDZ de const/
// let). selectedPresetId = de qual preset as alterações divergem.
const UNSAVED_ID = '__unsaved__';
let selectedPresetId = DEFAULT_PRESET_ID;
let userPresets = loadUserPresets(); // vibes do usuário (localStorage)
function loadVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 170; // primeira visita: sem preferência salva
    const saved = Number(raw);
    return Number.isFinite(saved) && saved >= 0 && saved <= 200 ? saved : 170;
  } catch { return 170; }
}
let masterVolume = loadVolume();
function setMasterVolume(percent) {
  masterVolume = Math.max(0, Math.min(200, Math.round(percent / 5) * 5));
  const slider = document.getElementById('ctrl-volume');
  const value = document.getElementById('val-volume');
  if (slider) slider.value = String(masterVolume);
  if (value) value.textContent = `${masterVolume}%`;
  if (masterGain) masterGain.gain.rampTo(masterVolume / 100, 0.05);
  try { localStorage.setItem(VOLUME_KEY, String(masterVolume)); } catch { /* armazenamento indisponível */ }
}
const activeKeys = new Set();
const activePointers = new Map(); // pointerId -> note index
let audioInitPromise = null;
const audioStatus = document.getElementById('audio-status');
// Versão do JS. A versão do HTML vem de <meta name="html-version">, para que,
// se o celular estiver com HTML em cache antigo, dê para ver os dois números
// e diagnosticar o que o GitHub Pages já propagou.
const JS_VERSION = '2026-10-29ab';
const HTML_VERSION =
  document.querySelector('meta[name="html-version"]')?.content || '???';
const audioButton = document.getElementById('start-audio');
function setAudioStatus(message, error = false) {
  audioStatus.textContent = message;
  audioStatus.style.color = error ? '#ff9292' : '#00ffcc';
}

// Linha de versão SEMPRE visível (não some com o status do áudio). Mostra as
// versões de HTML e JS para diagnosticar cache do GitHub Pages de relance.
const versionLine = document.getElementById('version-line');
if (versionLine) versionLine.textContent = `HTML v${HTML_VERSION} · JS v${JS_VERSION}`;

audioButton.addEventListener('click', () => { setAudioStatus('Iniciando áudio…'); wakeAudio(); });
setAudioStatus('Toque no botão ou numa tecla para ativar o áudio');


setMasterVolume(masterVolume);

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
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // ESTADO "dormindo": o 1º toque SÓ acorda o áudio. Aqui NÃO chamamos
    // preventDefault — no mobile ele pode invalidar o gesto e pendurar o
    // Tone.start(). Sem nota para segurar ainda, não precisamos dele.
    if (!isStarted) { wakeAudio(); return; }
    // ESTADO "tocando": áudio ativo, toca a nota normalmente.
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* mobile: ok ignorar */ }
    activePointers.set(e.pointerId, index);
    updateNote(index);
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

// Popula os seletores de escala/nota base e conecta sua troca. Estes controles
// não dependem do áudio estar ativo, então ligamos a troca já aqui (retune só
// toca no harp quando ele existe).
populateScaleControls();
populatePresetControl();
bindControls(); // painel sempre visível; handlers seguros antes do áudio

// Save geral (Opção A): restaura a última configuração salva, se houver.
// Assim o instrumento "acorda" como foi deixado. Sem estado salvo, segue com
// os defaults do HTML/preset. Como dá para puxar qualquer preset de volta,
// não há risco de ficar preso numa config bagunçada.
const savedWorkState = loadWorkState();
if (savedWorkState) {
  applyWorkState(savedWorkState);
  updateDeleteButton();
}
refreshModifiedIndicator(); // honra o estado real (pode já vir modificado)
// Chamado em qualquer mudança de estado: grava a config e atualiza o indicador
// de "modificado" (●). Só o indicador é imediato; o save tem debounce próprio.
function onStateChanged() {
  saveWorkState();
  refreshModifiedIndicator();
}
document.getElementById('ctrl-scale').addEventListener('change', (e) => {
  retune(currentRoot, e.target.value);
  onStateChanged();
  e.target.blur(); // devolve o foco para o teclado tocar notas em seguida
});
document.getElementById('ctrl-root').addEventListener('change', (e) => {
  retune(e.target.value, currentScaleId);
  onStateChanged();
  e.target.blur();
});
document.getElementById('ctrl-preset').addEventListener('change', (e) => {
  // Selecionar a própria entrada "✎ Não salvo" não faz nada (já é o estado).
  if (e.target.value === UNSAVED_ID) { e.target.blur(); return; }
  applyPreset(e.target.value); // descarta alterações, carrega o preset limpo
  updateDeleteButton();
  saveWorkState();             // persiste a nova config (sem o indicador)
  e.target.blur();             // devolve o foco ao teclado
});
// Save geral: qualquer ajuste nos controles do painel (sliders, ondas) grava
// o estado de trabalho e atualiza o indicador. Listener único (delegação).
const controlsRoot = document.getElementById('controls');
if (controlsRoot) {
  controlsRoot.addEventListener('input', onStateChanged);
  controlsRoot.addEventListener('change', onStateChanged);
}
// Volume também faz parte da config lembrada (não afeta o indicador: não é
// parte do preset).
document.getElementById('ctrl-volume').addEventListener('input', saveWorkState);
document.getElementById('save-vibe').addEventListener('click', () => {
  const input = document.getElementById('vibe-name');
  saveCurrentVibe(input.value);
  input.value = '';
});
document.getElementById('vibe-name').addEventListener('keydown', (e) => {
  // Enter salva; e não deixa a tecla vazar como nota (é um campo de texto).
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = e.target;
    saveCurrentVibe(input.value);
    input.value = '';
    input.blur();
  }
});
document.getElementById('delete-vibe').addEventListener('click', () => {
  deleteSelectedVibe();
});
// Comércio exterior: exportar/importar arquivo .harpa.json.
document.getElementById('export-vibe').addEventListener('click', () => {
  exportCurrentVibe();
});
document.getElementById('import-vibe').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) importVibeFile(file);
  e.target.value = ''; // permite reimportar o mesmo arquivo depois
});
document.getElementById('ctrl-wave1').addEventListener('change', (e) => {
  harp?.setWaveform('osc1', e.target.value);
  e.target.blur();
});
document.getElementById('ctrl-wave2').addEventListener('change', (e) => {
  harp?.setWaveform('osc2', e.target.value);
  e.target.blur();
});

// Inicialização do Áudio.
// O navegador só permite iniciar o AudioContext a partir de um gesto do
// usuário, então chamamos isto na primeira tecla pressionada. Essa primeira
// tecla serve de "destravamento" e normalmente ainda não soa; da segunda
// em diante o som sai normal.
async function initAudio() {
  if (isStarted) return;
  isStarting = true;
  setAudioStatus('Inicializando áudio…');
  await Tone.start(); // dentro do gesto do usuário (mecanismo que funcionava)
  Tone.context.latencyHint = 'interactive';

  // Volume de saída independente da atenuação protetora de -12 dB.
  masterGain = new Tone.Gain(masterVolume / 100).toDestination();

  // --- EFEITOS E FILTRO ---
  // Reverb removido para aliviar a CPU (Raspberry Pi). O "rabo" suave ao
  // soltar a tecla continua vindo do release do AmplitudeEnvelope da voz.

  // Chorus modo 1 do Synthex (frequência baixa, profundidade alta).
  chorus = new Tone.Chorus({
    frequency: PRESET.chorus.frequency,
    delayTime: PRESET.chorus.delayTime,
    depth: PRESET.chorus.depth,
    wet: PRESET.chorus.wet
  }).connect(masterGain).start();

  // O filtro agora é POR VOZ (key tracking), dentro de cada LaserVoice.
  // Aqui só somamos as vozes já filtradas e atenuamos -12 dB antes do chorus.
  // 10 ^ (-12 / 20) = 0.2511886.
  inputGain = new Tone.Gain(0.2511886).connect(chorus);

  // LFO triangular ÚNICO, compartilhado por todas as vozes (PWM do OSC2).
  pwmLfo = new Tone.LFO({
    type: 'triangle',
    frequency: PRESET.pwmLfoRate,
    min: PRESET.osc2Width - PRESET.pwmLfoDepth,
    max: PRESET.osc2Width + PRESET.pwmLfoDepth
  }).start();

  // Instrumento dual-oscilador (modelagem Preset 46 Synthex).
  harp = new LaserHarp(inputGain, pwmLfo, 12);

  isStarted = true;
  isStarting = false;
  setAudioStatus('Áudio ativo — toque nas notas');
  audioButton.style.display = 'none';

  // Honra ajustes feitos nos sliders antes de o áudio estar ligado.
  applyControlValues();
}

// Liga os controles do sintetizador. Pode ser chamado ANTES do áudio existir:
// cada handler sempre atualiza o rótulo, mas só toca no grafo de áudio se ele
// já existe (harp/chorus). Ao ativar o áudio, applyControlValues() aplica os
// valores atuais dos sliders de uma vez.
function bindControls() {
  document.getElementById('ctrl-volume').addEventListener('input', (e) => {
    setMasterVolume(Number(e.target.value));
  });
  // Glide Speed
  document.getElementById('ctrl-glide').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-glide').innerText = val;
    harp?.setPortamento(val / 1000);
  });

  // Filtro (× nota) — key tracking: cutoff = fator × frequência da nota.
  // Vale da próxima nota em diante.
  document.getElementById('ctrl-cutoff').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-cutoff').innerText = `${val.toFixed(1)}×`;
    harp?.setFilterKeyTrack(val);
  });

  // Ressonância (Q) — aplicada a todas as vozes.
  document.getElementById('ctrl-res').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-res').innerText = val;
    harp?.setFilterQ(val);
  });

  // Chorus
  document.getElementById('ctrl-chorus').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-chorus').innerText = `${Math.round(val * 100)}%`;
    if (chorus) chorus.wet.rampTo(val, 0.05);
  });

  // Intervalo base do OSC2 acima da nota (semitons). Define o caráter: 12 =
  // oitava, 31 = o brilho da harpa laser. Vale da próxima nota em diante.
  document.getElementById('ctrl-interval').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-interval').innerText = val;
    harp?.setOsc2Semitones(val);
  });

  // Sweep OSC2 — intensidade do "poinnn" (vale da próxima nota em diante)
  document.getElementById('ctrl-sweep').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-sweep').innerText = val;
    harp?.setSweepSemitones(val);
  });

  // Sweep OSC2 — tempo do "poinnn" (ms -> segundos)
  document.getElementById('ctrl-sweeptime').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-sweeptime').innerText = val;
    harp?.setSweepTime(val / 1000);
  });

  // Mix OSC2 — presença do segundo oscilador
  document.getElementById('ctrl-osc2').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-osc2').innerText = `${Math.round(val * 100)}%`;
    harp?.setOsc2Level(val);
  });

  // Envelope ADSR (AmplitudeEnvelope de cada voz). Vale da próxima nota.
  // Attack (ms -> s)
  document.getElementById('ctrl-attack').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-attack').innerText = val;
    harp?.setEnvelope('attack', val / 1000);
  });

  // Decay (ms -> s)
  document.getElementById('ctrl-decay').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-decay').innerText = val;
    harp?.setEnvelope('decay', val / 1000);
  });

  // Sustain (0 a 1)
  document.getElementById('ctrl-sustain').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-sustain').innerText = `${Math.round(val * 100)}%`;
    harp?.setEnvelope('sustain', val);
  });

  // Release (ms -> s)
  document.getElementById('ctrl-release').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-release').innerText = val;
    harp?.setEnvelope('release', val / 1000);
  });
}

// Aplica ao grafo de áudio os valores ATUAIS de todos os sliders. Chamado ao
// ativar o áudio, para honrar ajustes feitos antes de ligar.
function applyControlValues() {
  const num = (id) => parseFloat(document.getElementById(id).value);
  const val = (id) => document.getElementById(id).value;
  harp.setWaveform('osc1', val('ctrl-wave1'));
  harp.setWaveform('osc2', val('ctrl-wave2'));
  harp.setPortamento(num('ctrl-glide') / 1000);
  harp.setFilterKeyTrack(num('ctrl-cutoff'));
  harp.setFilterQ(num('ctrl-res'));
  chorus.wet.rampTo(num('ctrl-chorus'), 0.05);
  harp.setSweepSemitones(num('ctrl-sweep'));
  harp.setSweepTime(num('ctrl-sweeptime') / 1000);
  harp.setOsc2Semitones(num('ctrl-interval'));
  harp.setOsc2Level(num('ctrl-osc2'));
  harp.setEnvelope('attack', num('ctrl-attack') / 1000);
  harp.setEnvelope('decay', num('ctrl-decay') / 1000);
  harp.setEnvelope('sustain', num('ctrl-sustain'));
  harp.setEnvelope('release', num('ctrl-release') / 1000);
}

// ---------------------------------------------------------------------------
// VIBES DO USUÁRIO (localStorage). Mesma estrutura dos presets de fábrica,
// guardadas numa lista versionada. Import/export de arquivo fica para a
// próxima rodada (vai reusar este mesmo formato).
// (USER_PRESETS_KEY, VIBE_VERSION e userPresets ficam no bloco de globais, no
//  topo, para já existirem quando o setup chama populatePresetControl.)
// ---------------------------------------------------------------------------
function loadUserPresets() {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveUserPresets(list) {
  try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(list)); }
  catch { /* armazenamento indisponível */ }
}

// Lê o ESTADO ATUAL dos controles como um objeto de vibe (mesmos campos dos
// presets de fábrica). É o que vira uma "vibe do usuário" ao salvar.
function readCurrentVibe() {
  const num = (id) => parseFloat(document.getElementById(id).value);
  const val = (id) => document.getElementById(id).value;
  const vibe = { version: VIBE_VERSION };
  for (const [field, sliderId] of Object.entries(PRESET_SLIDER)) {
    vibe[field] = num(sliderId);
  }
  vibe.wave1 = val('ctrl-wave1');
  vibe.wave2 = val('ctrl-wave2');
  // Escala e nota base vêm do ESTADO real (currentScaleId/currentRoot), não do
  // .value do select — que pode ficar vazio se uma vibe trouxe um root fora da
  // lista de opções. Isso evita salvar root:"" e gerar duplicatas infinitas.
  vibe.scale = currentScaleId;
  vibe.root = currentRoot;
  return vibe;
}

// Busca um preset por id em ambas as listas (fábrica e usuário). Ids de
// usuário têm o prefixo 'user:'.
function presetById(id) {
  if (id && id.startsWith('user:')) {
    const i = Number(id.slice(5));
    if (userPresets[i]) return userPresets[i];
  }
  return FACTORY_PRESETS.find(p => p.id === id) || FACTORY_PRESETS[0];
}

// Aplica um preset: seta cada slider e DISPARA 'input' para reusar os handlers
// (rótulo + áudio), e reafina a escala/nota base. Também marca os selects.
function applyPreset(id) {
  const preset = presetById(id);
  for (const [field, sliderId] of Object.entries(PRESET_SLIDER)) {
    const el = document.getElementById(sliderId);
    if (el && preset[field] !== undefined) {
      el.value = String(preset[field]);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  // Formas de onda dos dois osciladores.
  const wave1Sel = document.getElementById('ctrl-wave1');
  const wave2Sel = document.getElementById('ctrl-wave2');
  if (wave1Sel) { wave1Sel.value = preset.wave1; harp?.setWaveform('osc1', preset.wave1); }
  if (wave2Sel) { wave2Sel.value = preset.wave2; harp?.setWaveform('osc2', preset.wave2); }

  // Escala + nota base (reafina as 12 teclas com segurança).
  const scaleSel = document.getElementById('ctrl-scale');
  const rootSel = document.getElementById('ctrl-root');
  if (scaleSel) scaleSel.value = preset.scale;
  if (rootSel) { ensureRootOption(preset.root); rootSel.value = preset.root; }
  retune(preset.root, preset.scale);
  // Aplicar um preset DESCARTA as alterações: vira o preset selecionado,
  // esconde a entrada "✎ Não salvo" e marca o seletor no preset real.
  selectedPresetId = (id === UNSAVED_ID) ? selectedPresetId : id;
  const presetSel = document.getElementById('ctrl-preset');
  if (presetSel) {
    const unsaved = presetSel.querySelector(`option[value="${UNSAVED_ID}"]`);
    if (unsaved) unsaved.hidden = true;
    presetSel.value = selectedPresetId;
  }
}

// (Re)popula o seletor com presets de fábrica + vibes do usuário na MESMA
// lista, em dois grupos (optgroup). As do usuário levam id 'user:N'. keepId
// tenta manter a seleção atual após reconstruir (ex.: depois de salvar/apagar).
function populatePresetControl(keepId) {
  const sel = document.getElementById('ctrl-preset');
  if (!sel) return;
  const previous = keepId || selectedPresetId || DEFAULT_PRESET_ID;
  sel.innerHTML = '';

  // Entrada especial, escondida até existir alteração não salva. Fica no topo
  // para aparecer já selecionada quando o estado diverge de um preset.
  const unsaved = document.createElement('option');
  unsaved.value = UNSAVED_ID;
  unsaved.textContent = '✎ Não salvo';
  unsaved.hidden = true;
  sel.appendChild(unsaved);

  const factoryGroup = document.createElement('optgroup');
  factoryGroup.label = 'De fábrica';
  FACTORY_PRESETS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    factoryGroup.appendChild(opt);
  });
  sel.appendChild(factoryGroup);

  if (userPresets.length) {
    const userGroup = document.createElement('optgroup');
    userGroup.label = 'Minhas vibes';
    userPresets.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = `user:${i}`;
      opt.textContent = p.name || p.label || 'Vibe ' + (i + 1);
      userGroup.appendChild(opt);
    });
    sel.appendChild(userGroup);
  }

  sel.value = previous;
  if (!sel.value) sel.value = DEFAULT_PRESET_ID;
  selectedPresetId = sel.value;
  updateDeleteButton();
}

// O estado atual difere do preset realmente selecionado?
function isStateModified() {
  const preset = presetById(selectedPresetId);
  const cur = readCurrentVibe();
  for (const field of Object.keys(PRESET_SLIDER)) {
    if (Number(cur[field]) !== Number(preset[field])) return true;
  }
  if (cur.wave1 !== preset.wave1 || cur.wave2 !== preset.wave2) return true;
  if (cur.scale !== preset.scale || cur.root !== preset.root) return true;
  return false;
}

// Mostra/esconde a entrada "✎ Não salvo" conforme o estado diverge do preset.
// Nunca suja o nome dos presets — só alterna para a entrada especial.
function refreshModifiedIndicator() {
  const sel = document.getElementById('ctrl-preset');
  if (!sel) return;
  const unsaved = sel.querySelector(`option[value="${UNSAVED_ID}"]`);
  const modified = isStateModified();
  if (unsaved) unsaved.hidden = !modified;
  // Quando modificado, mostra "✎ Não salvo"; senão, volta ao preset real.
  sel.value = modified ? UNSAVED_ID : selectedPresetId;
}

// Mostra o botão Apagar só quando uma vibe do USUÁRIO está selecionada.
function updateDeleteButton() {
  const sel = document.getElementById('ctrl-preset');
  const btn = document.getElementById('delete-vibe');
  if (!sel || !btn) return;
  btn.style.display = sel.value.startsWith('user:') ? '' : 'none';
}

// Salva a vibe atual na lista do usuário (localStorage) e seleciona-a.
function saveCurrentVibe(name) {
  const vibe = readCurrentVibe();
  vibe.name = name.trim() || `Vibe ${userPresets.length + 1}`;
  userPresets.push(vibe);
  saveUserPresets(userPresets);
  populatePresetControl(`user:${userPresets.length - 1}`);
}

// Apaga a vibe do usuário atualmente selecionada.
function deleteSelectedVibe() {
  const sel = document.getElementById('ctrl-preset');
  if (!sel || !sel.value.startsWith('user:')) return;
  const i = Number(sel.value.slice(5));
  if (!userPresets[i]) return;
  userPresets.splice(i, 1);
  saveUserPresets(userPresets);
  populatePresetControl(DEFAULT_PRESET_ID);
  saveWorkState();
}

// ---------------------------------------------------------------------------
// IMPORT / EXPORT de arquivo (.harpa.json). Mesmo formato das vibes do usuário.
// ---------------------------------------------------------------------------

// Toast de feedback ao lado dos botões, com fade. Some sozinho após ~2.6s.
let toastTimer = null;
function showToast(message, isError = false) {
  const el = document.getElementById('vibe-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Campos que definem uma vibe (para comparar e migrar). Deriva do mapa de
// sliders + os extras (ondas, escala, nota).
const VIBE_FIELDS = [...Object.keys(PRESET_SLIDER), 'wave1', 'wave2', 'scale', 'root'];

// Preenche campos ausentes com os do preset padrão (migração de arquivos
// antigos — ex.: sem 'interval'). Mantém o formato sempre completo.
function fixVibe(obj) {
  const base = presetById(DEFAULT_PRESET_ID);
  const vibe = { version: VIBE_VERSION };
  for (const f of VIBE_FIELDS) {
    const v = obj ? obj[f] : undefined;
    // undefined OU string vazia caem no default (evita root:"" / scale:"").
    vibe[f] = (v !== undefined && v !== '') ? v : base[f];
  }
  vibe.name = (obj && typeof obj.name === 'string' && obj.name.trim()) ? obj.name.trim() : 'Vibe importada';
  return vibe;
}

// Duas vibes são "iguais" se nome + todos os campos batem.
// Compara dois valores de campo: números como NÚMEROS (4 == 4.0), o resto como
// texto. A 'version' NÃO entra (é só o formato do arquivo, não parte do som).
function fieldsEqual(x, y) {
  const nx = Number(x), ny = Number(y);
  if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx === ny;
  return String(x) === String(y);
}
function vibesAreEqual(a, b) {
  if (!a || !b) return false;
  if ((a.name || '') !== (b.name || '')) return false;
  return VIBE_FIELDS.every(f => fieldsEqual(a[f], b[f]));
}

// Adiciona uma vibe à lista do usuário com a regra de duplicata combinada:
// - idêntica (nome + params) -> ignora;
// - mesmo nome, params diferentes -> renomeia "Nome (2)", "(3)"...;
// - nova -> adiciona.
// Retorna {status, index} para feedback.
function addUserVibe(vibe) {
  // Idêntica a alguma existente? ignora.
  const sameIdx = userPresets.findIndex(v => vibesAreEqual(v, vibe));
  if (sameIdx >= 0) return { status: 'duplicate', index: sameIdx };

  // Resolve colisão de nome (params diferentes).
  let name = vibe.name;
  if (userPresets.some(v => (v.name || '') === name)) {
    let n = 2;
    while (userPresets.some(v => (v.name || '') === `${vibe.name} (${n})`)) n++;
    name = `${vibe.name} (${n})`;
  }
  const stored = { ...vibe, name };
  userPresets.push(stored);
  saveUserPresets(userPresets);
  return { status: 'added', index: userPresets.length - 1 };
}

// Exporta o ESTADO ATUAL como arquivo .harpa.json (download).
function exportCurrentVibe() {
  const vibe = readCurrentVibe();
  // Nome: o do preset/vibe selecionado, ou um nome genérico.
  const sel = document.getElementById('ctrl-preset');
  const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  vibe.name = (opt && opt.value !== UNSAVED_ID) ? opt.textContent.trim() : 'Minha vibe';
  const safe = vibe.name.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') || 'vibe';
  const blob = new Blob([JSON.stringify(vibe, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.harpa.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Exportado: ${safe}.harpa.json`);
}

// Importa uma vibe de arquivo: lê, valida, migra, adiciona (regra de
// duplicata) e seleciona. Feedback via toast (ao lado dos botões).
function importVibeFile(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let parsed;
    try { parsed = JSON.parse(fr.result); }
    catch { showToast('Arquivo não é JSON válido', true); return; }
    if (!parsed || typeof parsed !== 'object') {
      showToast('Conteúdo inválido', true); return;
    }
    const vibe = fixVibe(parsed);
    const res = addUserVibe(vibe);
    populatePresetControl(`user:${res.index}`);
    applyPreset(`user:${res.index}`);
    updateDeleteButton();
    if (res.status === 'duplicate') {
      showToast(`"${vibe.name}" já existe — selecionada`);
    } else {
      showToast(`Vibe "${userPresets[res.index].name}" importada`);
    }
  };
  fr.onerror = () => showToast('Erro ao ler o arquivo', true);
  fr.readAsText(file);
}

// ---------------------------------------------------------------------------
// SAVE GERAL (Opção A): lembra a última configuração de trabalho e restaura ao
// abrir. Reaproveita readCurrentVibe() + o preset selecionado. Salvo com
// debounce para não martelar o localStorage a cada pixel do slider.
// ---------------------------------------------------------------------------
let saveWorkTimer = null;
function saveWorkState() {
  if (saveWorkTimer) clearTimeout(saveWorkTimer);
  saveWorkTimer = setTimeout(() => {
    try {
      const state = readCurrentVibe();
      // Guarda o PRESET REAL de referência (não '__unsaved__'), para saber de
      // qual preset o estado diverge ao restaurar.
      state.presetId = selectedPresetId || DEFAULT_PRESET_ID;
      localStorage.setItem(WORKSTATE_KEY, JSON.stringify(state));
    } catch { /* armazenamento indisponível */ }
  }, 250);
}

function loadWorkState() {
  try {
    const raw = localStorage.getItem(WORKSTATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && typeof s === 'object') ? s : null;
  } catch { return null; }
}

// Aplica um estado de trabalho salvo (os mesmos campos de uma vibe + presetId).
// Seta os sliders/ondas/escala e marca o preset de onde ele veio.
function applyWorkState(state) {
  for (const [field, sliderId] of Object.entries(PRESET_SLIDER)) {
    const el = document.getElementById(sliderId);
    if (el && state[field] !== undefined) {
      el.value = String(state[field]);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  const wave1Sel = document.getElementById('ctrl-wave1');
  const wave2Sel = document.getElementById('ctrl-wave2');
  if (wave1Sel && state.wave1) { wave1Sel.value = state.wave1; harp?.setWaveform('osc1', state.wave1); }
  if (wave2Sel && state.wave2) { wave2Sel.value = state.wave2; harp?.setWaveform('osc2', state.wave2); }
  const scaleSel = document.getElementById('ctrl-scale');
  const rootSel = document.getElementById('ctrl-root');
  if (scaleSel && state.scale) scaleSel.value = state.scale;
  if (rootSel && state.root) { ensureRootOption(state.root); rootSel.value = state.root; }
  if (state.scale && state.root) retune(state.root, state.scale);
  // Define o preset real de referência; refreshModifiedIndicator (chamado no
  // load) decide se mostra "✎ Não salvo" caso o estado restaurado divirja.
  if (state.presetId && state.presetId !== UNSAVED_ID) selectedPresetId = state.presetId;
  const presetSel = document.getElementById('ctrl-preset');
  if (presetSel) presetSel.value = selectedPresetId;
}

// Popula os <select> de escala e nota base e marca os valores atuais.
function populateScaleControls() {
  const scaleSel = document.getElementById('ctrl-scale');
  const rootSel = document.getElementById('ctrl-root');
  if (scaleSel && !scaleSel.options.length) {
    SCALES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      scaleSel.appendChild(opt);
    });
  }
  if (rootSel && !rootSel.options.length) {
    // Inclui a nota base padrão original mesmo que não esteja na lista segura.
    const roots = ROOT_NOTES.includes(DEFAULT_ROOT) ? ROOT_NOTES : [DEFAULT_ROOT, ...ROOT_NOTES];
    roots.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      rootSel.appendChild(opt);
    });
  }
  if (scaleSel) scaleSel.value = currentScaleId;
  if (rootSel) ensureRootOption(currentRoot), (rootSel.value = currentRoot);
}

// Garante que o <select> de nota base tenha a opção pedida. Se uma vibe trouxe
// um root fora da lista segura (ex.: 'C5' de uma versão antiga), adiciona a
// opção para o select nunca ficar vazio/dessincronizado.
function ensureRootOption(root) {
  const rootSel = document.getElementById('ctrl-root');
  if (!rootSel || !root) return;
  const exists = Array.from(rootSel.options).some(o => o.value === root);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = root;
    opt.textContent = root;
    rootSel.appendChild(opt);
  }
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

// Troca de escala/nota base com segurança: solta todas as notas que estiverem
// soando (senão o keyup usaria a nota NOVA e não acharia a antiga no pool),
// reafina as 12 teclas e limpa o destaque visual.
function retune(rootNote = currentRoot, scaleId = currentScaleId) {
  if (harp) {
    const held = new Set([...activeKeys, ...activePointers.values()]);
    held.forEach((index) => {
      const note = KEY_MAP[index].note;
      if (note) harp.triggerRelease(note);
      const el = document.getElementById(`key-${index}`);
      if (el) el.classList.remove('active');
    });
    activeKeys.clear();
    activePointers.clear();
  }
  applyScale(rootNote, scaleId);
}

// "Acorda" o áudio a partir de um gesto: SÓ o Tone.start() cru, leve e
// idempotente — NÃO monta o grafo aqui e NÃO guarda promise em
// audioInitPromise. Assim, se o start pendurar no mobile (acontece em
// pointerdown com preventDefault), nada fica preso e o botão continua livre.
// Quando o start resolve, aí sim montamos o grafo via ensureAudio().
function wakeAudio() {
  Tone.start().then(() => ensureAudio()).catch(() => { /* tenta no próximo gesto */ });
}

// Monta o grafo de áudio (pesado). Idempotente e tolerante a falha (permite
// nova tentativa num próximo gesto, sem travar o estado).
function ensureAudio() {
  if (isStarted) return Promise.resolve();
  if (!audioInitPromise) {
    audioInitPromise = initAudio().catch(error => {
      isStarting = false;
      audioInitPromise = null; // permite nova tentativa num próximo gesto
      setAudioStatus(`Falha no áudio: ${error?.message || String(error)} — toque em Ativar áudio`, true);
      audioButton.textContent = 'Tentar ativar áudio novamente';
      audioButton.style.display = '';
      throw error;
    });
  }
  return audioInitPromise;
}

// True quando o foco está num campo que CAPTURA teclas (select, campo de
// texto, textarea). Sliders (input[type=range]) NÃO contam: a tecla "C" não
// faz nada útil num range, então deixamos a nota tocar mesmo com o slider
// focado — assim dá para ajustar o som e tocar ao mesmo tempo.
function typingInField() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return el.type !== 'range';
  return false;
}

window.addEventListener('keydown', (e) => {
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') &&
      !e.altKey && !e.ctrlKey && !e.metaKey && !typingInField()) {
    e.preventDefault();
    setMasterVolume(masterVolume + (e.code === 'ArrowUp' ? 5 : -5));
    return;
  }
  if (e.repeat) return;
  // Ignora teclas de nota quando o foco está num campo de formulário (ex.: o
  // <select> de escala/nota). Senão, apertar "C" com o select focado o faz
  // pular entre opções C2, C3... em vez de tocar.
  if (typingInField()) return;
  const index = CODE_TO_INDEX.get(e.code);
  if (index === undefined) return;
  // ESTADO "dormindo": 1ª tecla só acorda o áudio (sem preventDefault, para
  // não invalidar o gesto; não soa ainda).
  if (!isStarted) { wakeAudio(); return; }
  // ESTADO "tocando": áudio ativo, toca a nota.
  e.preventDefault();
  activeKeys.add(index);
  updateNote(index);
});

window.addEventListener('keyup', (e) => {
  const index = CODE_TO_INDEX.get(e.code);
  if (index === undefined) return;
  // Sempre processa o keyup se a tecla estava ativa, mesmo que o foco tenha
  // mudado no meio, para não deixar uma nota presa.
  if (!activeKeys.has(index)) return;
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
