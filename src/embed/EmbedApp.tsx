import { useCallback, useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Stage, type WorkerId } from "../scene/Stage";
import { interpret } from "../commands";
import { blip, chirp } from "../voice";
import { DEFAULT_THEME, THEMES } from "../config";

const params = new URLSearchParams(window.location.search);
const OWNER = params.get("owner") ?? undefined; // site-owner wallet, billed for AI usage
const THEME = THEMES.find((t) => t.id === params.get("theme")) ?? DEFAULT_THEME;
const WORKER: WorkerId = params.get("worker") === "unit02" ? "unit02" : "unit01";
const IDLE = { clip: "Idle", nonce: 0 };

export function EmbedApp() {
  const [move, setMove] = useState(IDLE);
  const [expression, setExpression] = useState("Neutral");
  const [saying, setSaying] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [aiOn, setAiOn] = useState(false);
  const nonce = useRef(0);

  const triggerMove = useCallback((clip: string) => {
    nonce.current += 1;
    setMove({ clip, nonce: nonce.current });
  }, []);

  const handleFinished = useCallback(() => {
    nonce.current += 1;
    setMove({ clip: "Idle", nonce: nonce.current });
  }, []);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--accent", THEME.accent);
    root.setProperty("--accent2", THEME.accent2);
    root.setProperty("--bg", THEME.bg);
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: { aiProvider: string | null }) => setAiOn(!!c.aiProvider))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!saying) return;
    const t = setTimeout(() => setSaying(null), 9000);
    return () => clearTimeout(t);
  }, [saying]);

  const { active: loading, progress } = useProgress();
  const greeted = useRef(false);
  useEffect(() => {
    if (!greeted.current && !loading && progress >= 100) {
      greeted.current = true;
      const t = setTimeout(() => {
        triggerMove("Wave");
        setSaying("Unit-01 online. Ask me anything.");
      }, 600);
      return () => clearTimeout(t);
    }
  }, [loading, progress, triggerMove]);

  const handleSend = useCallback(
    async (raw: string) => {
      const input = raw.trim();
      if (!input) return;
      chirp();
      const local = interpret(input);
      if (local.matched || !aiOn) {
        if (local.move && local.move !== "Idle") triggerMove(local.move);
        if (local.expression) setExpression(local.expression);
        setSaying(local.reply);
        return;
      }
      setThinking(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input,
            wallet: OWNER,
            worker: WORKER === "unit02" ? "UNIT-02" : "UNIT-01",
          }),
        });
        if (res.status === 402) {
          setExpression("Sad");
          setSaying(
            "Energy depleted — this site's owner needs to top up credits at Hyluxtic.",
          );
          return;
        }
        if (!res.ok) {
          setSaying(local.reply);
          return;
        }
        const data = (await res.json()) as {
          source: string;
          reply?: string;
          move?: string;
          expression?: string;
        };
        if (data.source === "ai" && data.reply) {
          if (data.move && data.move !== "Idle") triggerMove(data.move);
          if (data.expression) setExpression(data.expression);
          setSaying(data.reply);
        } else {
          setSaying(local.reply);
        }
      } catch {
        setSaying(local.reply);
      } finally {
        setThinking(false);
      }
    },
    [aiOn, triggerMove],
  );

  return (
    <div className="ewrap">
      <div className="estage">
        <Stage
          move={move}
          expression={expression}
          theme={THEME}
          worker={WORKER}
          onFinished={handleFinished}
          onTap={() => {
            chirp();
            triggerMove("Wave");
            setSaying("Hello there!");
          }}
          onFps={() => {}}
        />
        {thinking ? (
          <div className="esub">» processing…</div>
        ) : (
          saying && <div className="esub">» {saying}</div>
        )}
        <a
          className="ebadge"
          href="/"
          target="_blank"
          rel="noreferrer"
          title="Powered by Hyluxtic"
        >
          ◈ HYLUXTIC
        </a>
      </div>
      <form
        className="ebar"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend(draft);
          setDraft("");
          blip(700, 0.05);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={aiOn ? "talk to UNIT-01…" : 'try "dance" or "wave"'}
          maxLength={300}
          spellCheck={false}
          disabled={thinking}
        />
        <button type="submit" aria-label="Send">
          ▸
        </button>
      </form>
    </div>
  );
}
