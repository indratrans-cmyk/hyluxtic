import { useCallback, useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Stage, type WorkerId } from "./scene/Stage";
import { HeroOrnament } from "./scene/HeroOrnament";
import { interpret } from "./commands";
import { blip, chirp, createRecognizer, hushSpeech, shutter, speak } from "./voice";
import { connectWallet, getPhantom, paySol, payToken, shortAddress } from "./wallet";
import type { CreditPackage } from "./shared/economy";
import {
  DEFAULT_THEME,
  DEMO_SEQUENCE,
  EXPRESSIONS,
  MOVES,
  ONE_SHOT,
  THEMES,
  type Theme,
} from "./config";

const IDLE = { clip: "Idle", nonce: 0 };

interface SiteConfig {
  treasury: string;
  rpc: string;
  packages: CreditPackage[];
  freeMessages: number;
  tokenCa: string;
  pumpUrl: string;
  aiProvider: string | null;
  hluxMint: string;
  hluxPerCredit: number;
  hluxDecimals: number;
}

interface AccountInfo {
  credits: number;
  freeLeft: number;
  msgCount?: number;
}

interface LiveStats {
  aiMessages: number;
  operators: number;
  solIn: number;
  payments: number;
}

interface HistoryData {
  credits: number;
  freeLeft: number;
  msgCount: number;
  payments: Array<{
    signature: string;
    sol: number | null;
    hlux: number | null;
    credits: number;
    token: string;
    at: number;
  }>;
}

const WORKERS: Array<{ id: WorkerId; name: string; role: string; blurb: string }> = [
  {
    id: "unit01",
    name: "UNIT-01",
    role: "hylux worker",
    blurb: "classic chassis · skeletal rig",
  },
  {
    id: "unit02",
    name: "UNIT-02",
    role: "hologram drone",
    blurb: "built in-house · procedural",
  },
];

const SOCIALS = [
  { label: "X / Twitter", href: "#", tag: "@hyluxtic" },
  { label: "Telegram", href: "#", tag: "t.me/hyluxtic" },
  { label: "pump.fun", href: "https://pump.fun", tag: "$HLUX" },
];

const ROADMAP = [
  {
    phase: "Phase 0",
    title: "Living showcase",
    status: "shipped",
    body: "UNIT-01 rendered live in the browser — skeletal motion, facial morphs, voice, themes, autopilot.",
  },
  {
    phase: "Phase 1",
    title: "Launch + a real brain",
    status: "now",
    body: "$HLUX fair launch on pump.fun. UNIT-01 converses via free-tier AI backends, and usage is paid in SOL — non-custodial, verified on-chain.",
  },
  {
    phase: "Phase 2",
    title: "Embed anywhere",
    status: "next",
    body: "Two-line HTML widget: put UNIT-01 on any website. Credit dashboard, $HLUX payments at a discount.",
  },
  {
    phase: "Phase 3",
    title: "Living Studio",
    status: "planned",
    body: "Describe a space, get a space — World Engine, custom workers, marketplace. The full Hyluxtic vision.",
  },
];

function LoaderOverlay() {
  const { active, progress } = useProgress();
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!active && progress >= 100) {
      const t = setTimeout(() => setGone(true), 500);
      return () => clearTimeout(t);
    }
  }, [active, progress]);

  if (gone) return null;
  const pct = Math.round(progress);
  return (
    <div className={`loader ${!active && progress >= 100 ? "loader--done" : ""}`}>
      <div className="loader__mark">HYLUXTIC</div>
      <div className="loader__bar">
        <div className="loader__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="loader__label">materializing unit-01 · {pct}%</div>
    </div>
  );
}

const CAPABILITIES = [
  {
    index: "A",
    title: "Worlds from words",
    body: "Describe a headquarters and the World Engine drafts the architecture, lighting, and navigation for you. No 3D software, no game engine — a sentence becomes a space.",
    tag: "WORLD ENGINE",
  },
  {
    index: "B",
    title: "A workforce that remembers",
    body: "Workers carry identity, voice, and persistent memory. They greet returning visitors by name, hold context across sessions, and act with the tools you grant them.",
    tag: "WORKFORCE + MEMORY",
  },
  {
    index: "C",
    title: "Ownership settles on-chain",
    body: "Wallet-first identity, creator payouts in SOL and USDC, marketplace rails powered by $HLUX. The blockchain stays invisible until the moment it is useful.",
    tag: "SOLANA SETTLEMENT",
  },
];

const ENGINES = [
  { name: "World", desc: "generates environments" },
  { name: "Workforce", desc: "creates AI workers" },
  { name: "Brain", desc: "reasoning + decisions" },
  { name: "Memory", desc: "persistent knowledge" },
  { name: "Voice", desc: "realtime speech" },
  { name: "Studio", desc: "visual editing" },
  { name: "Marketplace", desc: "community assets" },
  { name: "Deploy", desc: "publish anywhere" },
];

export function App() {
  const [move, setMove] = useState(IDLE);
  const [expression, setExpression] = useState("Neutral");
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [demo, setDemo] = useState(false);
  const [fps, setFps] = useState(0);
  const [muted, setMuted] = useState(false);
  const [saying, setSaying] = useState<{ text: string; nonce: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [cfg, setCfg] = useState<SiteConfig | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [thinking, setThinking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [listening, setListening] = useState(false);
  const [lowPerf, setLowPerf] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [payState, setPayState] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const talkSources = useRef({ stream: false, speech: false });
  const syncTalking = useCallback(() => {
    setTalking(talkSources.current.stream || talkSources.current.speech);
  }, []);
  const demoStep = useRef(0);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const [stats, setStats] = useState<LiveStats | null>(null);
  const [worker, setWorker] = useState<WorkerId>(() => {
    const saved = localStorage.getItem("hyluxtic-worker");
    return saved === "unit02" ? "unit02" : "unit01";
  });
  const activeWorker = WORKERS.find((w) => w.id === worker) ?? WORKERS[0]!;

  const switchWorker = useCallback((id: WorkerId) => {
    setWorker(id);
    localStorage.setItem("hyluxtic-worker", id);
    blip(id === "unit02" ? 980 : 620, 0.06);
  }, []);

  const triggerMove = useCallback((clip: string) => {
    setMove((prev) => ({ clip, nonce: prev.nonce + 1 }));
  }, []);

  const say = useCallback(
    (text: string) => {
      setSaying((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
      speak(text, mutedRef.current, {
        onStart: () => {
          talkSources.current.speech = true;
          syncTalking();
        },
        onEnd: () => {
          talkSources.current.speech = false;
          syncTalking();
        },
      });
    },
    [syncTalking],
  );

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: SiteConfig) => setCfg(c))
      .catch(() => setCfg(null));
    const loadStats = () => {
      fetch("/api/stats")
        .then((r) => r.json())
        .then((s: LiveStats) => setStats(s))
        .catch(() => {});
    };
    loadStats();
    const id = setInterval(loadStats, 60_000);
    return () => clearInterval(id);
  }, []);

  const refreshAccount = useCallback(async (addr: string): Promise<AccountInfo | null> => {
    try {
      const r = await fetch(`/api/account?wallet=${encodeURIComponent(addr)}`);
      if (r.ok) {
        const data = (await r.json()) as AccountInfo & { wallet: string };
        const info = {
          credits: data.credits,
          freeLeft: data.freeLeft,
          msgCount: data.msgCount,
        };
        setAccount(info);
        return info;
      }
    } catch {
      /* offline — leave as-is */
    }
    return null;
  }, []);

  const handleConnect = useCallback(async () => {
    try {
      blip(760, 0.05);
      const addr = await connectWallet();
      setWallet(addr);
      const info = await refreshAccount(addr);
      if (info && (info.msgCount ?? 0) > 0) {
        triggerMove("Wave");
        say("Welcome back, operator. I remember our conversations.");
      } else {
        say("Wallet linked. Your credits and our conversations now follow you.");
      }
    } catch (err) {
      setSaying({
        text: err instanceof Error ? err.message : "Wallet connection failed.",
        nonce: Date.now(),
      });
    }
  }, [refreshAccount, triggerMove, say]);

  // Subtitle fades out on its own after a while.
  useEffect(() => {
    if (!saying) return;
    const t = setTimeout(() => setSaying(null), 9000);
    return () => clearTimeout(t);
  }, [saying]);

  // First boot: once assets are in, UNIT-01 introduces itself (subtitle only —
  // speech waits for a user gesture per browser policy).
  const { active: loading, progress } = useProgress();
  const greeted = useRef(false);
  useEffect(() => {
    if (!greeted.current && !loading && progress >= 100) {
      greeted.current = true;
      const t = setTimeout(() => {
        triggerMove("Wave");
        setSaying({
          text: "Unit-01 online. Talk to me in the console below — any language works.",
          nonce: 1,
        });
      }, 700);
      return () => clearTimeout(t);
    }
  }, [loading, progress, triggerMove]);

  const applyDirective = useCallback(
    (d: { reply: string; move?: string; expression?: string; themeId?: string; demo?: boolean }) => {
      if (d.demo !== undefined) setDemo(d.demo);
      else setDemo(false);
      if (d.move && d.move !== "Idle") triggerMove(d.move);
      if (d.expression) setExpression(d.expression);
      if (d.themeId) {
        const t = THEMES.find((t) => t.id === d.themeId);
        if (t) setTheme(t);
      }
      say(d.reply);
    },
    [triggerMove, say],
  );

  const handleTransmit = useCallback(
    async (raw: string) => {
      const input = raw.trim();
      if (!input) return;
      chirp();
      const local = interpret(input);

      // Gesture/theme commands are handled locally — instant and free.
      if (local.matched || !cfg?.aiProvider) {
        applyDirective(local);
        return;
      }

      // Free-form talk streams from the AI brain (free-tier backend, metered).
      setDemo(false);
      setThinking(true);
      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input,
            wallet: wallet ?? undefined,
            worker: activeWorker.name,
          }),
        });
        if (res.status === 402) {
          const data = (await res.json()) as { error: string };
          if (data.error === "connect_wallet") {
            say("Free signal exhausted, operator. Connect your wallet to keep talking to me.");
          } else {
            say("My brain runs on energy credits — top up a little SOL and we keep going.");
            setTopupOpen(true);
          }
          setExpression("Sad");
          return;
        }
        if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("event-stream")) {
          applyDirective(local);
          return;
        }

        // Parse the SSE stream: meta → token* → done|error.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let text = "";
        let gotAi = false;
        setThinking(false);
        talkSources.current.stream = true;
        syncTalking();

        const handleEvent = (event: string, raw: string) => {
          try {
            const data = JSON.parse(raw) as Record<string, unknown>;
            if (event === "meta") {
              gotAi = true;
              const mv = data.move as string | undefined;
              const ex = data.expression as string | undefined;
              if (mv && mv !== "Idle") triggerMove(mv);
              if (ex) setExpression(ex);
              setSaying((prev) => ({ text: "", nonce: (prev?.nonce ?? 0) + 1 }));
            } else if (event === "token") {
              text += (data.text as string) ?? "";
              setSaying((prev) => ({ text, nonce: prev?.nonce ?? 1 }));
            } else if (event === "done") {
              const reply = (data.reply as string) || text;
              const remaining = data.remaining as AccountInfo | undefined;
              speak(reply, mutedRef.current, {
                onStart: () => {
                  talkSources.current.speech = true;
                  syncTalking();
                },
                onEnd: () => {
                  talkSources.current.speech = false;
                  syncTalking();
                },
              });
              if (remaining) {
                setAccount((prev) =>
                  wallet
                    ? { ...remaining, msgCount: prev?.msgCount }
                    : prev
                      ? { ...prev, freeLeft: remaining.freeLeft }
                      : null,
                );
              }
            } else if (event === "error" && !gotAi) {
              applyDirective(local);
            }
          } catch {
            /* malformed frame — skip */
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const eventMatch = frame.match(/^event: (.+)$/m);
            const dataMatch = frame.match(/^data: (.+)$/m);
            if (eventMatch?.[1] && dataMatch?.[1]) handleEvent(eventMatch[1], dataMatch[1]);
          }
        }
      } catch {
        applyDirective(local);
      } finally {
        setThinking(false);
        talkSources.current.stream = false;
        syncTalking();
      }
    },
    [cfg, wallet, activeWorker.name, applyDirective, triggerMove, say, syncTalking],
  );

  const handleTopup = useCallback(
    async (pkg: CreditPackage, payWith: "SOL" | "HLUX" = "SOL") => {
      if (!cfg?.treasury) return;
      try {
        let addr = wallet;
        if (!addr) {
          addr = await connectWallet();
          setWallet(addr);
        }
        setPayState("Waiting for wallet signature…");
        const signature =
          payWith === "HLUX"
            ? await payToken(
                cfg.rpc,
                cfg.treasury,
                cfg.hluxMint,
                cfg.hluxDecimals,
                pkg.credits * cfg.hluxPerCredit,
                addr,
              )
            : await paySol(cfg.rpc, cfg.treasury, pkg.lamports, addr);
        setPayState("Confirmed on-chain. Verifying…");
        const res = await fetch("/api/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature, wallet: addr, token: payWith }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          creditsAdded?: number;
          credits?: number;
          freeLeft?: number;
          error?: string;
        };
        if (data.ok) {
          setAccount({ credits: data.credits ?? 0, freeLeft: data.freeLeft ?? 0 });
          setPayState(`+${data.creditsAdded} credits added. Thank you, operator!`);
          chirp();
          triggerMove("ThumbsUp");
          say(`Energy restored — ${data.creditsAdded} message credits online.`);
          setTimeout(() => {
            setTopupOpen(false);
            setPayState(null);
          }, 2200);
        } else {
          setPayState(`Verification failed: ${data.error ?? "unknown error"}`);
        }
      } catch (err) {
        setPayState(err instanceof Error ? err.message : "Payment failed.");
      }
    },
    [cfg, wallet, triggerMove, say],
  );

  const handleCapture = useCallback(() => {
    const canvas = stageBoxRef.current?.querySelector("canvas");
    if (!canvas) return;
    shutter();
    const link = document.createElement("a");
    link.download = `hyluxtic-${worker}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [worker]);

  const handleShare = useCallback(async () => {
    const canvas = stageBoxRef.current?.querySelector("canvas");
    const text = `Say hello to ${activeWorker.name} — a living 3D AI worker by Hyluxtic ⚡ $HLUX`;
    const url = window.location.origin;
    blip(880, 0.05);
    try {
      if (canvas && navigator.canShare) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
        if (blob) {
          const file = new File([blob], "hyluxtic.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text, url });
            return;
          }
        }
      }
    } catch {
      /* user cancelled or share failed — fall through to X intent */
    }
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener",
    );
  }, [activeWorker.name]);

  // Voice input — speak to the worker; auto-submits on result.
  const recognizer = useRef<{ start: () => void; stop: () => void } | null>(null);
  const handleMic = useCallback(() => {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const lang = navigator.language?.startsWith("id") ? "id-ID" : "en-US";
    recognizer.current = createRecognizer(lang, {
      onResult: (text) => {
        setDraft(text);
        void handleTransmit(text);
        setDraft("");
      },
      onEnd: () => setListening(false),
    });
    if (!recognizer.current) {
      say("Voice input isn't available in this browser — type to me instead.");
      return;
    }
    blip(760, 0.05);
    setListening(true);
    recognizer.current.start();
  }, [listening, handleTransmit, say]);

  const handleFinished = useCallback(() => {
    setMove((prev) => ({ clip: "Idle", nonce: prev.nonce + 1 }));
  }, []);

  // Theme drives the page chrome too, not just the scene.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--accent", theme.accent);
    root.setProperty("--accent2", theme.accent2);
    root.setProperty("--bg", theme.bg);
  }, [theme]);

  // Autopilot: cycle the curated playlist while enabled.
  useEffect(() => {
    if (!demo) return;
    const play = () => {
      const step = DEMO_SEQUENCE[demoStep.current % DEMO_SEQUENCE.length]!;
      demoStep.current += 1;
      setExpression(step.expression);
      triggerMove(step.clip);
    };
    play();
    const id = setInterval(play, 4800);
    return () => clearInterval(id);
  }, [demo, triggerMove]);

  // Performance governor: if FPS stays low after warm-up, drop to eco mode
  // (dpr 1, no post-processing) — smoothness beats effects on weak devices.
  const fpsSamples = useRef<number[]>([]);
  const handleFps = useCallback((f: number) => {
    setFps(f);
    const s = fpsSamples.current;
    s.push(f);
    if (s.length > 8) s.shift();
    if (s.length === 8 && s.every((v) => v < 36)) {
      setLowPerf((prev) => {
        if (!prev) blip(300, 0.08);
        return true;
      });
    }
  }, []);

  // Scroll-reveal: sections ease in the first time they enter the viewport.
  useEffect(() => {
    const sections = document.querySelectorAll(".section");
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("section--in");
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1 },
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  // Keyboard: 1–0 for moves, Z X C V for expressions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      const key = e.key.toLowerCase();
      const m = MOVES.find((x) => x.key === key);
      if (m) {
        setDemo(false);
        triggerMove(m.clip);
        return;
      }
      const x = EXPRESSIONS.find((x) => x.key === key);
      if (x) setExpression(x.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerMove]);

  const handleTap = useCallback(() => {
    setDemo(false);
    chirp();
    triggerMove("Wave");
    say("Hello there, operator.");
  }, [triggerMove, say]);

  return (
    <>
      <LoaderOverlay />
      <div className="noise" aria-hidden="true" />

      <header className="nav">
        <a className="nav__mark" href="#top">
          HYLUXTIC
        </a>
        <nav className="nav__links">
          <a href="#agent">Worker</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#engines">Engines</a>
          <a href="#token">$HLUX</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <div className="nav__right">
          {wallet ? (
            <button
              type="button"
              className="chip chip--wallet"
              title={`${wallet} — open dashboard`}
              onClick={() => {
                setDashOpen(true);
                blip(700, 0.05);
                fetch(`/api/history?wallet=${encodeURIComponent(wallet)}`)
                  .then((r) => r.json())
                  .then((d: HistoryData) => setHistory(d))
                  .catch(() => {});
              }}
            >
              ◈ {shortAddress(wallet)}
              {account ? ` · ${account.credits} cr` : ""}
            </button>
          ) : (
            <button type="button" className="btn" onClick={handleConnect}>
              Connect wallet
            </button>
          )}
          <a className="btn btn--primary" href="#agent">
            Enter the space
          </a>
        </div>
      </header>

      <main id="top">
        {/* ---------- HERO ---------- */}
        <section className="hero">
          <div className="hero__grid" aria-hidden="true" />
          <div className="hero__glow" aria-hidden="true" />
          <div className="hero__visual" aria-hidden="true">
            <HeroOrnament theme={theme} />
            <span className="corner corner--tl" />
            <span className="corner corner--br" />
            <div className="hero__caption">$hlux core · rendered live</div>
          </div>
          <div className="hero__content">
          <p className="eyebrow">
            <span className="eyebrow__dot" /> presence — the internet, alive
          </p>
          <h1 className="hero__title">
            <span>Not a chatbot.</span>
            <span className="holo-sweep">A workforce.</span>
          </h1>
          <p className="hero__sub">
            Hyluxtic workers have a face, a voice and a body. They greet your
            visitors, get things done, then settle up on-chain — living inside
            your website. Meet them below, rendered live in your browser.
          </p>
          <div className="hero__cta">
            <a className="btn btn--primary btn--lg" href="#agent">
              Build your worker ↗
            </a>
            <a className="btn btn--ghost btn--lg" href="#token">
              Explore $HLUX
            </a>
          </div>
          <ul className="hero__stats">
            <li>
              <b>{stats ? stats.aiMessages.toLocaleString() : "—"}</b> ai replies
              served
            </li>
            <li>
              <b>{stats ? stats.operators.toLocaleString() : "—"}</b> operators
            </li>
            <li>
              <b>{stats ? stats.solIn.toFixed(2) : "—"}</b> sol treasury
            </li>
            <li>
              <b>{fps > 0 ? fps : "60"}</b> fps live
            </li>
          </ul>
          </div>
        </section>

        {/* ---------- TICKER ---------- */}
        <div className="ticker" aria-hidden="true">
          <div className="ticker__track">
            {[0, 1].map((k) => (
              <span key={k}>
                $HLUX — living digital infrastructure · UNIT-01 live now ·{" "}
                {stats ? stats.aiMessages.toLocaleString() : "—"} ai replies
                served · pay-per-use on solana · non-custodial · launching on
                pump.fun · the internet, alive ·{" "}
              </span>
            ))}
          </div>
        </div>

        {/* ---------- LIVE WORKER ---------- */}
        <section className="section" id="agent">
          <div className="section__head">
            <span className="section__index">01 — live workers</span>
            <h2>
              Meet the <span className="text-holo">workforce</span>.
            </h2>
            <p>
              Two Hyluxtic worker prototypes — switch between them in the deck.
              Drag to orbit, click a unit to make it wave. Everything renders
              in real time: skeletal animation, a procedural hologram chassis,
              live face screens, iridescent PBR, and bloom.
            </p>
          </div>

          <div className="stagewrap">
            <div className="stage">
              <div className="stage__canvas" ref={stageBoxRef}>
                <Stage
                  move={move}
                  expression={expression}
                  theme={theme}
                  worker={worker}
                  talking={talking}
                  lowPerf={lowPerf}
                  onFinished={handleFinished}
                  onTap={handleTap}
                  onFps={handleFps}
                />
                <div className="stage__scan" aria-hidden="true" />
                <span className="corner corner--tl" aria-hidden="true" />
                <span className="corner corner--tr" aria-hidden="true" />
                <span className="corner corner--bl" aria-hidden="true" />
                <span className="corner corner--br" aria-hidden="true" />
                <div className="hud hud--tl">
                  <span className="hud__dot" /> live · webgl2
                </div>
                <div className="hud hud--tr">
                  {fps} fps{lowPerf ? " · eco" : ""} · dpr{" "}
                  {lowPerf
                    ? 1
                    : Math.min(2, Math.round((window.devicePixelRatio || 1) * 10) / 10)}
                </div>
                <div className="hud hud--bl">
                  <div className="hud__unit">{activeWorker.name}</div>
                  <div className="hud__role">
                    {activeWorker.role} · {move.clip.toLowerCase()} ·{" "}
                    {expression.toLowerCase()}
                  </div>
                </div>
                <div className="hud hud--br">
                  drag = orbit · scroll = zoom · click = wave
                </div>
                {thinking ? (
                  <div className="subtitle subtitle--thinking">
                    <span className="subtitle__caret">»</span> processing
                    <span className="dots">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </div>
                ) : (
                  saying && (
                    <div className="subtitle" key={saying.nonce}>
                      <span className="subtitle__caret">»</span> {saying.text}
                    </div>
                  )
                )}
                <div className="stage__actions">
                  <button
                    type="button"
                    className="stage__capture"
                    onClick={handleCapture}
                    title="Save a PNG of the current frame"
                  >
                    ⛶ capture
                  </button>
                  <button
                    type="button"
                    className="stage__capture"
                    onClick={() => void handleShare()}
                    title="Share to X / socials"
                  >
                    ⤴ share
                  </button>
                </div>
              </div>

              <aside className="deck">
                <div className="deck__group">
                  <div className="deck__label">worker</div>
                  <div className="deck__row">
                    {WORKERS.map((w) => (
                      <button
                        type="button"
                        key={w.id}
                        className={`workerbtn ${worker === w.id ? "workerbtn--on" : ""}`}
                        onClick={() => switchWorker(w.id)}
                      >
                        <span className="workerbtn__name">{w.name}</span>
                        <span className="workerbtn__blurb">{w.blurb}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="deck__group">
                  <div className="deck__labelrow">
                    <div className="deck__label">transmit</div>
                    <button
                      type="button"
                      className="mini"
                      onClick={() => {
                        setMuted((m) => {
                          if (!m) hushSpeech();
                          return !m;
                        });
                        blip(muted ? 900 : 400, 0.06);
                      }}
                      title={muted ? "Unmute voice" : "Mute voice"}
                      aria-pressed={muted}
                    >
                      {muted ? "🔇 muted" : "🔊 voice"}
                    </button>
                  </div>
                  <form
                    className="transmit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleTransmit(draft);
                      setDraft("");
                    }}
                  >
                    <button
                      type="button"
                      className={`transmit__mic ${listening ? "transmit__mic--on" : ""}`}
                      onClick={handleMic}
                      title={listening ? "Stop listening" : "Speak to the worker"}
                      aria-label="Voice input"
                    >
                      {listening ? "●" : "🎙"}
                    </button>
                    <input
                      className="transmit__input"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        listening
                          ? "listening…"
                          : cfg?.aiProvider
                            ? "talk to me — anything, any language"
                            : 'say something… "dance", "who are you"'
                      }
                      maxLength={300}
                      spellCheck={false}
                      disabled={thinking || listening}
                    />
                    <button className="transmit__send" type="submit" aria-label="Send">
                      ▸
                    </button>
                  </form>
                  <div className="transmit__status">
                    {cfg?.aiProvider ? (
                      <>
                        <span className="transmit__ai">
                          ● ai online · {cfg.aiProvider}
                        </span>
                        {wallet && account ? (
                          <span>
                            {account.freeLeft} free · {account.credits} credits
                          </span>
                        ) : (
                          <span>{cfg.freeMessages} free msgs, then SOL</span>
                        )}
                        {cfg.treasury && (
                          <button
                            type="button"
                            className="mini"
                            onClick={() => {
                              setPayState(null);
                              setTopupOpen(true);
                            }}
                          >
                            ⚡ top up
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="transmit__ai transmit__ai--off">
                        ○ rule mode — commands only
                      </span>
                    )}
                  </div>
                </div>

                <div className="deck__group">
                  <div className="deck__label">motion</div>
                  <div className="deck__moves">
                    {MOVES.map((m) => (
                      <button
                        key={m.clip}
                        type="button"
                        className={`key ${move.clip === m.clip ? "key--on" : ""}`}
                        onClick={() => {
                          setDemo(false);
                          blip(660, 0.05);
                          triggerMove(m.clip);
                        }}
                      >
                        <span className="key__emoji">{m.emoji}</span>
                        <span className="key__label">{m.label}</span>
                        <kbd>{m.key}</kbd>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="deck__group">
                  <div className="deck__label">expression</div>
                  <div className="deck__row">
                    {EXPRESSIONS.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        className={`key key--sm ${expression === x.id ? "key--on" : ""}`}
                        onClick={() => setExpression(x.id)}
                        title={`${x.label} (${x.key.toUpperCase()})`}
                      >
                        <span className="key__emoji">{x.emoji}</span>
                        <span className="key__label">{x.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="deck__group">
                  <div className="deck__label">spectrum</div>
                  <div className="deck__row">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`swatch ${theme.id === t.id ? "swatch--on" : ""}`}
                        onClick={() => setTheme(t)}
                        title={t.label}
                      >
                        <span
                          className="swatch__dot"
                          style={{
                            background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`,
                          }}
                        />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="deck__group">
                  <div className="deck__label">autopilot</div>
                  <button
                    type="button"
                    className={`toggle ${demo ? "toggle--on" : ""}`}
                    onClick={() => setDemo((d) => !d)}
                    aria-pressed={demo}
                  >
                    <span className="toggle__pill">
                      <span className="toggle__knob" />
                    </span>
                    {demo ? "demo running — click to stop" : "run the demo reel"}
                  </button>
                </div>

                <p className="deck__hint">
                  keys <kbd>1</kbd>–<kbd>0</kbd> motion · <kbd>Z</kbd>{" "}
                  <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd> face
                </p>
              </aside>
            </div>
          </div>
        </section>

        {/* ---------- CAPABILITIES ---------- */}
        <section className="section" id="capabilities">
          <div className="section__head">
            <span className="section__index">02 — capabilities</span>
            <h2>
              Not a website. <span className="text-holo">A living space.</span>
            </h2>
            <p>
              Pages end. Spaces begin. Every Hyluxtic deployment is an
              environment that understands its visitors and works on their
              behalf.
            </p>
          </div>
          <div className="cards">
            {CAPABILITIES.map((c) => (
              <article className="card" key={c.index}>
                <div className="card__index">{c.index}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="card__tag">{c.tag}</span>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- ENGINES ---------- */}
        <section className="section" id="engines">
          <div className="section__head">
            <span className="section__index">03 — the engines</span>
            <h2>
              Eight engines. <span className="text-holo">One platform.</span>
            </h2>
            <p>
              Every engine is modular, replaceable, and provider-agnostic. The
              browser is the runtime; intent is the interface.
            </p>
          </div>
          <div className="engines">
            {ENGINES.map((e, i) => (
              <div className="engine" key={e.name}>
                <span className="engine__no">{String(i + 1).padStart(2, "0")}</span>
                <span className="engine__name">{e.name}</span>
                <span className="engine__desc">{e.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- TOKEN ---------- */}
        <section className="section" id="token">
          <div className="section__head">
            <span className="section__index">04 — the token</span>
            <h2>
              <span className="text-holo">$HLUX</span> is the fuel.
            </h2>
            <p>
              Fair launch on pump.fun — no presale, no team allocation games.
              Utility first: talking to UNIT-01 costs SOL today, and $HLUX
              unlocks discounts and marketplace rails next.
            </p>
          </div>

          <div className="token">
            <div className="token__ca">
              <div className="deck__label">contract address</div>
              <div className="token__carow">
                <code className="token__code">
                  {cfg?.tokenCa || "TBA — launching on pump.fun"}
                </code>
                {cfg?.tokenCa && (
                  <button
                    type="button"
                    className="mini"
                    onClick={() => {
                      void navigator.clipboard.writeText(cfg.tokenCa);
                      setCopied(true);
                      blip(900, 0.05);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    {copied ? "✓ copied" : "⧉ copy"}
                  </button>
                )}
              </div>
              <a
                className="btn btn--solid"
                href={cfg?.pumpUrl || "https://pump.fun"}
                target="_blank"
                rel="noreferrer"
              >
                ▶ Buy on pump.fun
              </a>
              {cfg?.treasury && (
                <div className="token__treasury">
                  <span>
                    treasury: {stats ? stats.solIn.toFixed(3) : "—"} SOL ·{" "}
                    {stats?.payments ?? 0} payments
                  </span>
                  <a
                    href={`https://solscan.io/account/${cfg.treasury}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    audit on Solscan ↗
                  </a>
                </div>
              )}
            </div>

            <div className="token__facts">
              <article className="card card--slim">
                <h3>Pay-per-use, live now</h3>
                <p>
                  Every AI conversation with UNIT-01 is metered. Credits are
                  bought with SOL, verified on-chain, straight to the treasury
                  — non-custodial, no middleman.
                </p>
              </article>
              <article className="card card--slim">
                <h3>$HLUX utility next</h3>
                <p>
                  Pay in $HLUX for discounted credits, unlock marketplace
                  listings, and power creator payouts as the engines ship.
                </p>
              </article>
              <article className="card card--slim">
                <h3>Honest metric</h3>
                <p>
                  Success is measured in spaces built and workers deployed —
                  not price. That is written into our founding documents.
                </p>
              </article>
            </div>
          </div>
          <p className="token__disclaimer">
            $HLUX is a utility token. Nothing on this page is financial advice;
            crypto assets are volatile — never spend what you can't afford to
            lose.
          </p>
        </section>

        {/* ---------- ROADMAP ---------- */}
        <section className="section" id="roadmap">
          <div className="section__head">
            <span className="section__index">05 — roadmap</span>
            <h2>
              Shipped, shipping, <span className="text-holo">next.</span>
            </h2>
          </div>
          <div className="roadmap">
            {ROADMAP.map((r) => (
              <article className={`roadstep roadstep--${r.status}`} key={r.phase}>
                <div className="roadstep__top">
                  <span className="roadstep__phase">{r.phase}</span>
                  <span className="roadstep__status">{r.status}</span>
                </div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- EMBED ---------- */}
        <section className="section" id="embed">
          <div className="section__head">
            <span className="section__index">06 — embed</span>
            <h2>
              UNIT-01 on <span className="text-holo">your site.</span>
            </h2>
            <p>
              One script tag and the worker appears on any website. AI usage
              bills the credits of the wallet you pass — your visitors chat,
              you stay in control.
            </p>
          </div>
          <div className="embedbox">
            <pre className="embedbox__code">
              <code>{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/embed.js"\n        data-owner="YOUR_WALLET" data-theme="spectra"></script>`}</code>
            </pre>
            <div className="embedbox__actions">
              <button
                type="button"
                className="btn btn--solid"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `<script src="${window.location.origin}/embed.js" data-owner="YOUR_WALLET" data-theme="spectra"></script>`,
                  );
                  blip(900, 0.05);
                }}
              >
                ⧉ Copy snippet
              </button>
              <a className="btn btn--ghost" href="/embed" target="_blank" rel="noreferrer">
                ▶ Live preview
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__mark">HYLUXTIC</div>
        <p>
          Living digital infrastructure. $HLUX is infrastructure — not the
          product. Success is measured in spaces built, not price.
        </p>
        <div className="footer__socials">
          {SOCIALS.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noreferrer">
              {s.label} <span>{s.tag}</span>
            </a>
          ))}
        </div>
        <p className="footer__fine">© 2026 Hyluxtic — all systems in-house.</p>
      </footer>

      {topupOpen && cfg && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setTopupOpen(false);
              setPayState(null);
            }
          }}
        >
          <div className="modal__box">
            <div className="modal__head">
              <div className="deck__label">energy top-up</div>
              <button
                type="button"
                className="mini"
                onClick={() => {
                  setTopupOpen(false);
                  setPayState(null);
                }}
              >
                ✕ close
              </button>
            </div>
            <p className="modal__sub">
              Pay SOL from Phantom straight to the Hyluxtic treasury. Verified
              on-chain, credits appear instantly. Non-custodial — we never hold
              your keys.
            </p>
            <div className="modal__packages">
              {cfg.packages.map((p) => (
                <div className="pkgcol" key={p.id}>
                  <button
                    type="button"
                    className="pkg"
                    onClick={() => void handleTopup(p, "SOL")}
                    disabled={!!payState && payState.endsWith("…")}
                  >
                    {p.tag && <span className="pkg__tag">{p.tag}</span>}
                    <span className="pkg__name">{p.label}</span>
                    <span className="pkg__sol">{p.sol} SOL</span>
                    <span className="pkg__credits">{p.credits} messages</span>
                  </button>
                  {cfg.hluxMint && (
                    <button
                      type="button"
                      className="pkg pkg--hlux"
                      onClick={() => void handleTopup(p, "HLUX")}
                      disabled={!!payState && payState.endsWith("…")}
                      title="Pay with $HLUX"
                    >
                      <span className="pkg__credits">
                        or {(p.credits * cfg.hluxPerCredit).toLocaleString()} $HLUX
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!getPhantom() && (
              <p className="modal__warn">
                Phantom wallet not detected —{" "}
                <a href="https://phantom.app" target="_blank" rel="noreferrer">
                  install it here
                </a>
                .
              </p>
            )}
            {payState && <p className="modal__state">{payState}</p>}
          </div>
        </div>
      )}

      {dashOpen && wallet && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDashOpen(false);
          }}
        >
          <div className="modal__box">
            <div className="modal__head">
              <div className="deck__label">operator dashboard</div>
              <button type="button" className="mini" onClick={() => setDashOpen(false)}>
                ✕ close
              </button>
            </div>
            <p className="modal__sub" title={wallet}>
              ◈ {shortAddress(wallet)} ·{" "}
              <a
                href={`https://solscan.io/account/${wallet}`}
                target="_blank"
                rel="noreferrer"
                className="dash__link"
              >
                view on Solscan ↗
              </a>
            </p>
            {history ? (
              <>
                <div className="dash__stats">
                  <div className="dash__stat">
                    <b>{history.credits}</b>
                    <span>credits</span>
                  </div>
                  <div className="dash__stat">
                    <b>{history.freeLeft}</b>
                    <span>free left</span>
                  </div>
                  <div className="dash__stat">
                    <b>{history.msgCount}</b>
                    <span>messages</span>
                  </div>
                  <div className="dash__stat">
                    <b>{history.payments.length}</b>
                    <span>payments</span>
                  </div>
                </div>
                {history.payments.length > 0 ? (
                  <div className="dash__tablewrap">
                    <table className="dash__table">
                      <thead>
                        <tr>
                          <th>date</th>
                          <th>paid</th>
                          <th>credits</th>
                          <th>tx</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.payments.map((p) => (
                          <tr key={p.signature}>
                            <td>{new Date(p.at).toLocaleDateString()}</td>
                            <td>
                              {p.token === "SOL"
                                ? `${p.sol?.toFixed(3)} SOL`
                                : `${p.hlux?.toLocaleString()} $HLUX`}
                            </td>
                            <td>+{p.credits}</td>
                            <td>
                              <a
                                href={`https://solscan.io/tx/${p.signature}`}
                                target="_blank"
                                rel="noreferrer"
                                className="dash__link"
                              >
                                {p.signature.slice(0, 6)}… ↗
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="modal__sub">
                    No payments yet — your first {cfg?.freeMessages ?? 5} AI
                    messages are free.
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn--solid"
                  onClick={() => {
                    setDashOpen(false);
                    setPayState(null);
                    setTopupOpen(true);
                  }}
                >
                  ⚡ Top up credits
                </button>
              </>
            ) : (
              <p className="modal__sub">loading…</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
