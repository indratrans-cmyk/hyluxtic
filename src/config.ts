export interface Move {
  clip: string;
  label: string;
  emoji: string;
  key: string;
  loop: boolean;
}

/** Motion clips baked into RobotExpressive.glb. One-shots return to Idle. */
export const MOVES: Move[] = [
  { clip: "Wave", label: "Wave", emoji: "👋", key: "1", loop: false },
  { clip: "Dance", label: "Dance", emoji: "🕺", key: "2", loop: true },
  { clip: "Jump", label: "Jump", emoji: "⤴️", key: "3", loop: false },
  { clip: "Yes", label: "Yes", emoji: "✅", key: "4", loop: false },
  { clip: "No", label: "No", emoji: "🙅", key: "5", loop: false },
  { clip: "ThumbsUp", label: "Thumbs up", emoji: "👍", key: "6", loop: false },
  { clip: "Punch", label: "Punch", emoji: "🥊", key: "7", loop: false },
  { clip: "Walking", label: "Walk", emoji: "🚶", key: "8", loop: true },
  { clip: "Running", label: "Run", emoji: "🏃", key: "9", loop: true },
  { clip: "Death", label: "Collapse", emoji: "💀", key: "0", loop: false },
];

export const ONE_SHOT = new Set(
  MOVES.filter((m) => !m.loop).map((m) => m.clip),
);

export interface Expression {
  id: string; // morph target name, or "Neutral"
  label: string;
  emoji: string;
  key: string;
}

/** Facial morph targets baked into the head mesh. */
export const EXPRESSIONS: Expression[] = [
  { id: "Neutral", label: "Neutral", emoji: "🙂", key: "z" },
  { id: "Angry", label: "Angry", emoji: "😠", key: "x" },
  { id: "Surprised", label: "Surprised", emoji: "😲", key: "c" },
  { id: "Sad", label: "Sad", emoji: "😢", key: "v" },
];

export interface Theme {
  id: string;
  label: string;
  accent: string; // primary neon — lights, ring, UI
  accent2: string; // secondary neon — rim light, gradients
  bg: string; // scene + page background
  body: string; // robot shell base color
  emissive: string; // robot shell inner glow
  eyes: string; // face plate / joint glow (bloomed)
  shadow: string; // contact shadow tint
}

export const THEMES: Theme[] = [
  {
    id: "violet",
    label: "Violet",
    accent: "#a78bfa",
    accent2: "#ff5ce1",
    bg: "#08040f",
    body: "#34205f",
    emissive: "#29104f",
    eyes: "#c4b5fd",
    shadow: "#7c3aed",
  },
  {
    id: "spectra",
    label: "Spectra",
    accent: "#3de8ff",
    accent2: "#ff4ecd",
    bg: "#04070d",
    body: "#123340",
    emissive: "#0a2e3f",
    eyes: "#66f0ff",
    shadow: "#0891b2",
  },
  {
    id: "aurum",
    label: "Aurum",
    accent: "#ffd166",
    accent2: "#ff7849",
    bg: "#0a0704",
    body: "#4a3416",
    emissive: "#3c2508",
    eyes: "#ffe08a",
    shadow: "#d97706",
  },
  {
    id: "verdant",
    label: "Verdant",
    accent: "#4ade80",
    accent2: "#a3e635",
    bg: "#030a06",
    body: "#14432a",
    emissive: "#0b3520",
    eyes: "#86efac",
    shadow: "#16a34a",
  },
];

export const DEFAULT_THEME = THEMES[0]!;

/** Autopilot playlist — pairs of motion + expression, cycled in demo mode. */
export const DEMO_SEQUENCE: Array<{ clip: string; expression: string }> = [
  { clip: "Wave", expression: "Neutral" },
  { clip: "Dance", expression: "Surprised" },
  { clip: "ThumbsUp", expression: "Neutral" },
  { clip: "Punch", expression: "Angry" },
  { clip: "Jump", expression: "Surprised" },
  { clip: "No", expression: "Angry" },
  { clip: "Walking", expression: "Neutral" },
  { clip: "Yes", expression: "Neutral" },
  { clip: "Death", expression: "Sad" },
];
