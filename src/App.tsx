import { useCallback, useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Stage } from "./scene/Stage";
import { HeroOrnament } from "./scene/HeroOrnament";
import { interpret } from "./commands";
import { blip, chirp, hushSpeech, shutter, speak } from "./voice";
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
  const [topupOpen, setTopupOpen] = useState(false);
  const [payState, setPayState] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const demoStep = useRef(0);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const [stats, setStats] = useState<LiveStats | null>(null);

  const triggerMove = useCallback((clip: string) => {
    setMove((prev) => ({ clip, nonce: prev.nonce + 1 }));
  }, []);

  const say = useCallback((text: string) => {
    setSaying((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
    speak(text, mutedRef.current);
  }, []);

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

      // Free-form talk goes to the AI brain (free-tier backend, metered).
      setDemo(false);
      setThinking(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: input, wallet: wallet ?? undefined }),
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
        if (!res.ok) {
          applyDirective(local);
          return;
        }
        const data = (await res.json()) as {
          source: string;
          reply?: string;
          move?: string;
          expression?: string;
          remaining?: AccountInfo;
        };
        if (data.source === "ai" && data.reply) {
          if (data.move && data.move !== "Idle") triggerMove(data.move);
          if (data.expression) setExpression(data.expression);
          say(data.reply);
          if (data.remaining) {
            setAccount((prev) =>
              wallet ? data.remaining! : prev ? { ...prev, freeLeft: data.remaining!.freeLeft } : null,
            );
          }
        } else {
          applyDirective(local);
        }
      } catch {
        applyDirective(local);
      } finally {
        setThinking(false);
      }
    },
    [cfg, wallet, applyDirective, triggerMove, say],
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
    link.download = "hyluxtic-unit01.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

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
            <span className="chip chip--wallet" title={wallet}>
              ◈ {shortAddress(wallet)}
              {account ? ` · ${account.credits} cr` : ""}
            </span>
          ) : (
            <button type="button" className="btn" onClick={handleConnect}>
              Connect wallet
            </button>
          )}
          <a className="btn btn--solid" href="#agent">
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
          </div>
          <div className="hero__content">
          <p className="eyebrow">
            <span className="eyebrow__dot" /> living digital infrastructure —
            built on solana
          </p>
          <h1 className="hero__title">
            <span>The internet,</span>
            <span className="holo-sweep">alive.</span>
          </h1>
          <p className="hero__sub">
            Hyluxtic turns static pages into living digital spaces — 3D
            environments staffed by AI workers that speak, remember, and
            transact. Below: our first worker, rendered live in your browser.
          </p>
          <div className="hero__cta">
            <a className="btn btn--solid btn--lg" href="#agent">
              ▶ Meet UNIT-01
            </a>
            <a className="btn btn--ghost btn--lg" href="#capabilities">
              Read the vision
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
            <span className="section__index">01 — live worker</span>
            <h2>
              Say hello to <span className="text-holo">UNIT-01</span>.
            </h2>
            <p>
              A Hyluxtic worker prototype. Drag to orbit, scroll to zoom, click
              the unit to make it wave. Everything here renders in real time —
              skeletal animation, facial morphs, iridescent PBR, and bloom.
            </p>
          </div>

          <div className="stagewrap">
            <div className="stage">
              <div className="stage__canvas" ref={stageBoxRef}>
                <Stage
                  move={move}
                  expression={expression}
                  theme={theme}
                  onFinished={handleFinished}
                  onTap={handleTap}
                  onFps={setFps}
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
                  {fps} fps · dpr{" "}
                  {Math.min(2, Math.round((window.devicePixelRatio || 1) * 10) / 10)}
                </div>
                <div className="hud hud--bl">
                  <div className="hud__unit">UNIT-01</div>
                  <div className="hud__role">
                    hylux worker · {move.clip.toLowerCase()} ·{" "}
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
                <button
                  type="button"
                  className="stage__capture"
                  onClick={handleCapture}
                  title="Save a PNG of the current frame"
                >
                  ⛶ capture
                </button>
              </div>

              <aside className="deck">
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
                    <input
                      className="transmit__input"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        cfg?.aiProvider
                          ? "talk to me — anything, any language"
                          : 'say something… "dance", "who are you"'
                      }
                      maxLength={300}
                      spellCheck={false}
                      disabled={thinking}
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
        <p className="footer__fine">
          UNIT-01 body: RobotExpressive (three.js examples) · rendered with
          React Three Fiber on Bun · © 2026 Hyluxtic
        </p>
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
    </>
  );
}
