// ---------------------------------------------------------------------------
// Configuração (fácil de ajustar)
// ---------------------------------------------------------------------------

// 1. Tabela de NOTAS — a escala tocada, da mais grave para a mais aguda.
//    Ajuste aqui para mudar a afinação sem mexer nas teclas físicas.
const NOTES = [
  'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
  'C5', 'D5', 'E5', 'F5', 'G5'
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

let isStarted = false;
let polySynth, filter, chorus, reverb;
const activeKeys = new Set();

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
  keysContainer.appendChild(el);
});

// Inicialização do Áudio
document.getElementById('start-btn').addEventListener('click', async () => {
  if (isStarted) return;

  await Tone.start();
  Tone.context.latencyHint = 'interactive';

  // --- EFEITOS E FILTRO ---
  reverb = new Tone.Reverb({ decay: 3.2, wet: 0.35 }).toDestination();
  
  // Chorus modo 1 do Synthex (frequência baixa, profundidade alta)
  chorus = new Tone.Chorus({ frequency: 1.2, delayTime: 4.5, depth: 0.8, wet: 0.55 }).connect(reverb).start();

  filter = new Tone.Filter({
    frequency: 2400,
    type: 'lowpass',
    rolloff: -24,
    Q: 1.2
  }).connect(chorus);

  // --- SINTETIZADOR DUAL-OSCILLATOR (MODELAGEM PRESET 46 SYNTHEX) ---
  polySynth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 12,
    options: {
      oscillator: {
        type: 'pwm',          // Pulse Width Modulation no oscilador principal
        modulationFrequency: 0.3 // LFO lento modulando a largura de pulso (LFO -> PWM)
      },
      envelope: {
        attack: 0.005, // Ataque instantâneo sem estalo
        decay: 0.4,
        sustain: 0.6,
        release: 0.4
      },
      portamento: 0.05 // Glide rápido
    }
  }).connect(filter);

  // Aplicação do Pitch Bend/Glide Agressivo focado em simular o Hard Sync
  polySynth.set({
    pitchDecay: 0.045, // 45ms de variação harmônica
    octaves: 2.7,      // Equivale ao salto de oitavas (8' para 2' + 7 semitons do OSC2)
  });

  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('controls').style.display = 'grid';
  isStarted = true;

  bindControls();
});

function bindControls() {
  // Glide Speed
  document.getElementById('ctrl-glide').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('val-glide').innerText = val;
    polySynth.set({ portamento: val / 1000 });
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
}

// Teclado
window.addEventListener('keydown', (e) => {
  if (!isStarted || e.repeat) return;

  const index = CODE_TO_INDEX.get(e.code);
  if (index === undefined || activeKeys.has(index)) return;

  activeKeys.add(index);
  polySynth.triggerAttack(KEY_MAP[index].note);

  const el = document.getElementById(`key-${index}`);
  if (el) el.classList.add('active');
});

window.addEventListener('keyup', (e) => {
  if (!isStarted) return;

  const index = CODE_TO_INDEX.get(e.code);
  if (index === undefined || !activeKeys.has(index)) return;

  activeKeys.delete(index);
  polySynth.triggerRelease(KEY_MAP[index].note);

  const el = document.getElementById(`key-${index}`);
  if (el) el.classList.remove('active');
});