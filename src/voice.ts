/* Procedural robot audio — no asset files, pure WebAudio + speechSynthesis. */

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Single synth blip. */
export function blip(
  freq = 880,
  dur = 0.07,
  type: OscillatorType = "square",
  gain = 0.035,
) {
  try {
    const a = audio();
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    osc.connect(g).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur);
  } catch {
    /* audio unavailable — stay silent */
  }
}

/** Rising three-tone acknowledgment — UNIT-01 heard you. */
export function chirp() {
  blip(520, 0.06);
  setTimeout(() => blip(780, 0.06), 70);
  setTimeout(() => blip(1040, 0.09, "triangle"), 150);
}

/** Camera shutter for frame capture. */
export function shutter() {
  blip(1400, 0.04, "square", 0.05);
  setTimeout(() => blip(700, 0.05, "square", 0.04), 50);
}

/** Speak a line with a low robotic pitch. Cancels any line in progress. */
export function speak(
  text: string,
  muted: boolean,
  hooks?: { onStart?: () => void; onEnd?: () => void },
) {
  if (muted || typeof speechSynthesis === "undefined") {
    hooks?.onEnd?.();
    return;
  }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 0.55;
    u.volume = 0.9;
    const voices = speechSynthesis.getVoices();
    const voice =
      voices.find((v) => v.lang.startsWith("en") && /google|microsoft/i.test(v.name)) ??
      voices.find((v) => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    if (hooks?.onStart) u.onstart = hooks.onStart;
    if (hooks?.onEnd) {
      u.onend = hooks.onEnd;
      u.onerror = hooks.onEnd;
    }
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    hooks?.onEnd?.();
  }
}

/* ---------- speech recognition (voice input) ---------- */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function createRecognizer(
  lang: string,
  hooks: { onResult: (text: string) => void; onEnd: () => void },
): { start: () => void; stop: () => void } | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript ?? "";
    if (text) hooks.onResult(text);
  };
  rec.onend = hooks.onEnd;
  rec.onerror = hooks.onEnd;
  return {
    start: () => {
      try {
        rec.start();
      } catch {
        hooks.onEnd();
      }
    },
    stop: () => rec.stop(),
  };
}

export function hushSpeech() {
  try {
    speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
