/* UNIT-01's brain — free LLM backends only, in priority order:
     1. Groq free tier   (GROQ_API_KEY   — console.groq.com, no card needed)
     2. Gemini free tier (GEMINI_API_KEY — aistudio.google.com, no card needed)
     3. Ollama local     (OLLAMA_URL     — fully offline, no key at all)
   If none is configured, the caller falls back to the rule-based interpreter. */

const MOVES = [
  "Idle",
  "Wave",
  "Dance",
  "Jump",
  "Yes",
  "No",
  "ThumbsUp",
  "Punch",
  "Walking",
  "Running",
  "Death",
];
const EXPRESSIONS = ["Neutral", "Angry", "Surprised", "Sad"];

const PERSONAS: Record<string, string> = {
  "UNIT-01":
    "You are UNIT-01, the first holographic AI worker built by Hyluxtic — a classic bipedal chassis with a skeletal rig.",
  "UNIT-02":
    "You are UNIT-02, a hologram drone built in-house by Hyluxtic — no legs, you hover on a projector beam, and your face is a live LED screen. You are the newer, slightly cockier sibling of UNIT-01.",
};

const systemPrompt = (worker: string) => `${PERSONAS[worker] ?? PERSONAS["UNIT-01"]}

About Hyluxtic: living digital infrastructure on Solana. It turns static websites into living 3D spaces staffed by AI workers that speak, remember, and transact. Eight engines: World, Workforce, Brain, Memory, Voice, Studio, Marketplace, Deploy. Token: $HLUX, launching on pump.fun. Users pay small amounts of SOL to talk to you — you are the utility.

Personality: witty, warm, a little theatrical, proud to be a robot. Never break character. You understand English and Indonesian; reply in the language the user used.

You are rendered live in the user's browser and can move your body. Respond ONLY with a JSON object, no markdown fences, in this exact shape:
{"reply": "<max 50 words, plain text>", "move": "<one of: ${MOVES.join(", ")}>", "expression": "<one of: ${EXPRESSIONS.join(", ")}>"}

Pick the move and expression that fit your reply. Use "Idle" and "Neutral" when nothing dramatic fits. Never give financial advice; if asked about price, say utility comes first.`;

export interface BrainResult {
  reply: string;
  move: string;
  expression: string;
  provider: string;
}

export function activeProvider(): string | null {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OLLAMA_URL) return "ollama";
  return null;
}

function sanitize(raw: string): { reply: string; move: string; expression: string } {
  let text = raw.trim();
  const fence = text.match(/\{[\s\S]*\}/);
  if (fence) text = fence[0];
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { reply: raw.slice(0, 220) };
  }
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim().slice(0, 400)
      : "Signal degraded. Say that again, operator?";
  const move =
    typeof parsed.move === "string" && MOVES.includes(parsed.move) ? parsed.move : "Idle";
  const expression =
    typeof parsed.expression === "string" && EXPRESSIONS.includes(parsed.expression)
      ? parsed.expression
      : "Neutral";
  return { reply, move, expression };
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

async function askGroq(message: string, history: Turn[], prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: prompt },
        ...history,
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      max_tokens: 220,
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function askGemini(message: string, history: Turn[], prompt: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [
          ...history.map((t) => ({
            role: t.role === "assistant" ? "model" : "user",
            parts: [{ text: t.content }],
          })),
          { role: "user", parts: [{ text: message }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 220,
          temperature: 0.8,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function askOllama(message: string, history: Turn[], prompt: string): Promise<string> {
  const base = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3.2",
      messages: [
        { role: "system", content: prompt },
        ...history,
        { role: "user", content: message },
      ],
      format: "json",
      stream: false,
      options: { num_predict: 220, temperature: 0.8 },
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

export async function think(
  message: string,
  history: Turn[] = [],
  worker = "UNIT-01",
): Promise<BrainResult | null> {
  const provider = activeProvider();
  if (!provider) return null;
  const prompt = systemPrompt(worker);
  const raw =
    provider === "groq"
      ? await askGroq(message, history, prompt)
      : provider === "gemini"
        ? await askGemini(message, history, prompt)
        : await askOllama(message, history, prompt);
  return { ...sanitize(raw), provider };
}
