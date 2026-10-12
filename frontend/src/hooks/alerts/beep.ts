// Bipe de alerta via WebAudio: dois tons descendentes (880 Hz e 620 Hz).

const STEP_S = 0.18;
const TONES_HZ = [880, 620];

type AudioContextCtor = new () => AudioContext;

let ctx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // O navegador suspende o contexto até um gesto do usuário.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function beep(): void {
  const audio = ensureAudio();
  if (!audio) return;
  try {
    const t0 = audio.currentTime;
    TONES_HZ.forEach((freq, i) => {
      const at = t0 + i * STEP_S;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(at);
      osc.stop(at + STEP_S);
    });
  } catch {
    // sem áudio o alerta segue só visual
  }
}

/** Só para testes: descarta o contexto guardado. */
export function resetAudioForTests(): void {
  ctx = null;
}
