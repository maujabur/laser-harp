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

  // 1. Cadeia de Efeitos
  reverb = new Tone.Reverb({ decay: 2.8, wet: 0.35 }).toDestination();
  chorus = new Tone.Chorus({ frequency: 3.5, delayTime: 3.5, depth: 0.7, wet: 0.5 }).connect(reverb).start();

  // 2. Filtro Low-Pass
  filter = new Tone.Filter({
    frequency: 2200,
    type: 'lowpass',
    rolloff: -24,
    Q: 2.0
  }).connect(chorus);

  // 3. Sintetizador com Portamento (Glide) ativado
  polySynth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 12,
    options: {
      oscillator: {
        type: 'fatsawtooth',
        count: 3,
        spread: 30
      },
      envelope: {
        attack: 0.005,
        decay: 0.35,
        sustain: 0.4,
        release: 0.3
      },
      portamento: 0.045 // 45ms de Glide padrão (Preset 46 do Synthex)
    }
  }).connect(filter);

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