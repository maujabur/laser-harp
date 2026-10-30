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

  // Largura de pulso base de cada oscilador (0 = onda quadrada pura).
  osc1Width: 0.1,
  osc2Width: -0.2,

  // LFO triangular modulando a largura de pulso do OSC2 (tremor analógico).
  pwmLfoRate: 1.5,         // Hz — lento
  pwmLfoDepth: 0.25,       // profundidade da variação de width

  // Envelope de amplitude (compartilhado pelos dois osciladores da voz).
  envelope: { attack: 0.01, decay: 0.4, sustain: 0.55, release: 0.5 },

  // Portamento (glide) global entre notas, em segundos.
  portamento: 0.035,

  // Cadeia de efeitos (reverb removido para aliviar o Raspberry Pi).
  filter:  { frequency: 950, Q: 3.6 },
  chorus:  { frequency: 1.2, delayTime: 4.5, depth: 0.8, wet: 0.05 }
};

// ---------------------------------------------------------------------------
// Voz dual-oscilador. Cada voz é alocada a uma nota enquanto ela soa.
// ---------------------------------------------------------------------------
class LaserVoice {
  constructor(destination, pwmLfo) {
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

    // LFO triangular (ÚNICO, compartilhado por todas as vozes) modulando a
    // largura de pulso do OSC2. Todas as vozes "respiram" na mesma fase, o
    // que troca 12 LFOs por 1 só — bem mais leve para o Pi, sem efeito
    // colateral audível.
    pwmLfo.connect(this.osc2.width);

    this.osc1.start();
    this.osc2.start();

    // Parâmetros ajustáveis em tempo real (valem a partir da próxima nota).
    this.portamento = PRESET.portamento;
    this.osc2Semitones = PRESET.osc2Semitones;
    this.sweepSemitones = PRESET.osc2SweepSemitones;
    this.sweepTime = PRESET.osc2SweepTime;

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

  // Ajusta o ganho do OSC2 na mistura (0 a 1). Suave para evitar estalos.
  setOsc2Level(level) {
    this.gain2.gain.rampTo(level, 0.05);
  }

  dispose() {
    this.osc1.dispose();
    this.osc2.dispose();
    this.gain1.dispose();
    this.gain2.dispose();
    this.amp.dispose();
  }
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

  setSweepTime(seconds) {
    this.voices.forEach(v => v.setSweepTime(seconds));
  }

  setOsc2Level(level) {
    this.voices.forEach(v => v.setOsc2Level(level));
  }

  setEnvelope(param, value) {
    this.voices.forEach(v => { v.amp[param] = value; });
  }
}

let isStarted = false;
let isStarting = false;
let harp, filter, chorus, inputGain, masterGain, pwmLfo;
const VOLUME_KEY = 'laser-harp-master-volume-v1';
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
const JS_VERSION = '2026-10-29d';
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

audioButton.addEventListener('click', () => { setAudioStatus('Botão acionado — iniciando áudio…'); unlockAudio(); ensureAudio().catch(() => {}); });
setAudioStatus('Toque em Ativar áudio ou numa tecla');


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
  el.addEventListener('pointerdown', async (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Desbloqueia o AudioContext SÍNCRONO dentro do gesto, ANTES de qualquer
    // preventDefault/setPointerCapture — no Chrome mobile essas chamadas
    // podem invalidar o gesto e deixar o Tone.start() pendurado.
    const unlocking = unlockAudio();
    e.preventDefault();
    // setPointerCapture é frequentemente cancelado no mobile; se falhar,
    // seguimos em frente (o pointerup/cancel global ainda solta a nota).
    try { el.setPointerCapture(e.pointerId); } catch { /* mobile: ok ignorar */ }
    activePointers.set(e.pointerId, index);
    try {
      await unlocking;
      await ensureAudio();
      if (activePointers.get(e.pointerId) === index) updateNote(index);
    } catch (error) {
      console.error('Falha ao iniciar áudio:', error);
      setAudioStatus(`Falha no áudio: ${error?.message || String(error)} — use o botão Ativar áudio`, true);
    }
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
document.getElementById('ctrl-scale').addEventListener('change', (e) => {
  retune(currentRoot, e.target.value);
  e.target.blur(); // devolve o foco para o teclado tocar notas em seguida
});
document.getElementById('ctrl-root').addEventListener('change', (e) => {
  retune(e.target.value, currentScaleId);
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
  await unlockAudio(); // garante o contexto resumido antes de montar o grafo
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

  // Filtro Low-Pass 12 dB/oct (metade do custo do -24; timbre levemente
  // mais aberto, mas mais leve para o Pi).
  filter = new Tone.Filter({
    frequency: PRESET.filter.frequency,
    type: 'lowpass',
    rolloff: -12,
    Q: PRESET.filter.Q
  }).connect(chorus);

  // Teste móvel: atenuação de -12 dB ANTES dos efeitos, sem mudar o timbre.
  // 10 ^ (-12 / 20) = 0.2511886; todas as vozes somam neste estágio.
  inputGain = new Tone.Gain(0.2511886).connect(filter);

  // LFO triangular ÚNICO, compartilhado por todas as vozes (PWM do OSC2).
  pwmLfo = new Tone.LFO({
    type: 'triangle',
    frequency: PRESET.pwmLfoRate,
    min: PRESET.osc2Width - PRESET.pwmLfoDepth,
    max: PRESET.osc2Width + PRESET.pwmLfoDepth
  }).start();

  // Instrumento dual-oscilador (modelagem Preset 46 Synthex).
  harp = new LaserHarp(inputGain, pwmLfo, 12);

  document.getElementById('controls').style.display = 'grid';
  document.getElementById('controls-details').style.display = 'block';
  isStarted = true;
  isStarting = false;
  setAudioStatus('Áudio ativo — toque nas notas');
  audioButton.style.display = 'none';

  bindControls();
}

function bindControls() {
  document.getElementById('ctrl-volume').addEventListener('input', (e) => {
    setMasterVolume(Number(e.target.value));
  });
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

  // Envelope ADSR (AmplitudeEnvelope de cada voz). Vale da próxima nota.
  // Attack (ms -> s)
  document.getElementById('ctrl-attack').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-attack').innerText = val;
    harp.setEnvelope('attack', val / 1000);
  });

  // Decay (ms -> s)
  document.getElementById('ctrl-decay').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-decay').innerText = val;
    harp.setEnvelope('decay', val / 1000);
  });

  // Sustain (0 a 1)
  document.getElementById('ctrl-sustain').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-sustain').innerText = `${Math.round(val * 100)}%`;
    harp.setEnvelope('sustain', val);
  });

  // Release (ms -> s)
  document.getElementById('ctrl-release').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-release').innerText = val;
    harp.setEnvelope('release', val / 1000);
  });

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
  if (rootSel) rootSel.value = currentRoot;
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

// Desbloqueia o AudioContext (Tone.start) de forma idempotente. Deve ser
// chamado SÍNCRONO dentro de um gesto do usuário. Separado de ensureAudio
// para que o resume do contexto não dependa da construção do grafo.
let unlockPromise = null;
function unlockAudio() {
  if (unlockPromise) return unlockPromise;
  unlockPromise = Tone.start().catch((error) => {
    unlockPromise = null; // permite nova tentativa no próximo gesto
    throw error;
  });
  return unlockPromise;
}

function ensureAudio() {
  if (isStarted) return Promise.resolve();
  if (!audioInitPromise) {
    audioInitPromise = initAudio().catch(error => {
      isStarting = false;
      audioInitPromise = null;
      setAudioStatus(`Falha no áudio: ${error?.message || String(error)}`, true);
      audioButton.textContent = 'Tentar ativar áudio novamente';
      throw error;
    });
  }
  return audioInitPromise;
}

// True quando o foco está num campo de formulário (select/input/textarea),
// para que as teclas físicas não vazem como atalho desses campos.
function typingInField() {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
}

window.addEventListener('keydown', async (e) => {
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
  const unlocking = unlockAudio(); // síncrono dentro do gesto
  e.preventDefault();
  activeKeys.add(index);
  try {
    await unlocking;
    await ensureAudio();
    if (activeKeys.has(index)) updateNote(index);
  } catch (error) {
    console.error('Falha ao iniciar áudio:', error);
    setAudioStatus(`Falha no áudio: ${error?.message || String(error)} — use o botão Ativar áudio`, true);
  }
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
