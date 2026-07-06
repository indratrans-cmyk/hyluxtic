/* Rule-based command interpreter for the TRANSMIT console.
   Understands English and Indonesian keywords; replies in brand English. */

export interface Directive {
  reply: string;
  move?: string;
  expression?: string;
  themeId?: string;
  demo?: boolean;
  /** true = handled by a local rule; false = free-form talk, send it to the AI brain */
  matched: boolean;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

const GREETINGS = [
  "Unit-01 online. Welcome to the Hyluxtic deck.",
  "Signal received. Hello, operator.",
  "Greetings. This space is alive — and so am I.",
];

const UNKNOWN = [
  'Directive unclear. Try "dance", "punch", or "help".',
  "That instruction is not in my clip library — yet. Type \"help\".",
  "Processing… no matching routine. \"help\" lists what I can do.",
];

const HELP =
  "I understand: wave · dance · jump · yes · no · thumbs up · punch · walk · run · collapse · " +
  "angry · surprised · sad · neutral · spectra / violet / aurum / verdant · demo · who are you";

interface Rule {
  test: RegExp;
  make: () => Omit<Directive, "matched">;
}

const RULES: Rule[] = [
  {
    test: /help|bantuan|^\?$/,
    make: () => ({ reply: HELP, move: "Yes" }),
  },
  {
    test: /\b(hi|hello|hey|halo|hai|greet|sapa)\b/,
    make: () => ({ reply: pick(GREETINGS), move: "Wave" }),
  },
  {
    test: /who are you|siapa kamu|what are you|kamu (siapa|apa)/,
    make: () => ({
      reply:
        "I am UNIT-01 — the first Hyluxtic worker prototype. One day I will staff a living digital space near you.",
      move: "Wave",
    }),
  },
  {
    test: /hyluxtic|hlux/,
    make: () => ({
      reply:
        "Hyluxtic builds living digital infrastructure on Solana. Eight engines. One platform. I am the friendly face.",
      move: "ThumbsUp",
    }),
  },
  {
    test: /dance|joget|menari/,
    make: () => ({
      reply: "Engaging rhythm subroutine.",
      move: "Dance",
      expression: "Surprised",
    }),
  },
  {
    test: /jump|lompat/,
    make: () => ({ reply: "Gravity is a suggestion.", move: "Jump" }),
  },
  {
    test: /thumb|jempol|good|bagus|keren|nice|mantap/,
    make: () => ({ reply: "Acknowledged. Excellent taste, operator.", move: "ThumbsUp" }),
  },
  {
    test: /punch|tinju|fight/,
    make: () => ({
      reply: "Combat drill initiated. Do not worry — I am unionized.",
      move: "Punch",
      expression: "Angry",
    }),
  },
  {
    test: /\brun|lari/,
    make: () => ({ reply: "Cardio protocol engaged.", move: "Running" }),
  },
  {
    test: /walk|jalan/,
    make: () => ({ reply: "Taking a stroll around the projector.", move: "Walking" }),
  },
  {
    test: /die|death|mati|collapse/,
    make: () => ({
      reply: "Powering down… tell my compiler I loved her.",
      move: "Death",
      expression: "Sad",
    }),
  },
  {
    test: /\b(stop|idle|diam|berhenti|reset)\b/,
    make: () => ({ reply: "Standing by.", move: "Idle", expression: "Neutral", demo: false }),
  },
  {
    test: /\b(yes|ya|setuju|agree)\b/,
    make: () => ({ reply: "Affirmative.", move: "Yes" }),
  },
  {
    test: /\b(no|tidak|tolak|nggak|gak)\b/,
    make: () => ({ reply: "Negative.", move: "No" }),
  },
  {
    test: /angry|marah/,
    make: () => ({ reply: "Switching mood: irritated.", expression: "Angry" }),
  },
  {
    test: /surpris|kaget|shock/,
    make: () => ({ reply: "Oh! Unexpected input!", expression: "Surprised" }),
  },
  {
    test: /\bsad|sedih/,
    make: () => ({ reply: "Mood set to melancholic beeps.", expression: "Sad" }),
  },
  {
    test: /neutral|netral|calm|tenang/,
    make: () => ({ reply: "Mood normalized.", expression: "Neutral" }),
  },
  {
    test: /spectra/,
    make: () => ({ reply: "Spectrum: Spectra. Cyan looks good on me.", themeId: "spectra" }),
  },
  {
    test: /violet|ungu/,
    make: () => ({ reply: "Spectrum: Violet. A tribute to the classics.", themeId: "violet" }),
  },
  {
    test: /aurum|gold|emas/,
    make: () => ({ reply: "Spectrum: Aurum. Luxury mode engaged.", themeId: "aurum" }),
  },
  {
    test: /verdant|green|hijau/,
    make: () => ({ reply: "Spectrum: Verdant. Fully organic photons.", themeId: "verdant" }),
  },
  {
    test: /demo|autopilot/,
    make: () => ({ reply: "Autopilot engaged. Enjoy the reel.", demo: true }),
  },
  {
    test: /wave|lambai|dadah/,
    make: () => ({ reply: "Hello there!", move: "Wave" }),
  },
];

export function interpret(raw: string): Directive {
  const input = raw.trim().toLowerCase();
  if (!input) return { reply: pick(UNKNOWN), matched: true };
  for (const rule of RULES) {
    if (rule.test.test(input)) return { ...rule.make(), matched: true };
  }
  return {
    reply: pick(UNKNOWN),
    move: pick(["Yes", "No", "Wave"]),
    matched: false,
  };
}
