import index from "./index.html";
import { activeProvider, think } from "./src/server/brain";
import {
  appendTurns,
  getAccount,
  getHistory,
  getStats,
  ipFreeUsed,
  messageCount,
  paymentExists,
  recordPayment,
  useIpMessage,
  useWalletMessage,
} from "./src/server/db";
import { verifyTransfer } from "./src/server/solana";
import { creditsForLamports, FREE_MESSAGES, PACKAGES } from "./src/shared/economy";

const TREASURY = process.env.TREASURY_WALLET || "";
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const TOKEN_CA = process.env.TOKEN_CA || "";
const PUMP_URL = process.env.PUMP_URL || "https://pump.fun";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Simple in-memory rate limit: 20 requests/min per IP.
const hits = new Map<string, { count: number; windowStart: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.windowStart > 60_000) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  h.count += 1;
  return h.count > 20;
}

const server = Bun.serve({
  port: 3012,
  routes: {
    "/": index,

    "/robot.glb": () =>
      new Response(Bun.file("aset/robot.glb"), {
        headers: {
          "Content-Type": "model/gltf-binary",
          "Cache-Control": "public, max-age=86400",
        },
      }),

    "/og.png": () =>
      new Response(Bun.file("aset/og.png"), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
      }),

    "/api/config": () =>
      json({
        treasury: TREASURY,
        rpc: SOLANA_RPC,
        packages: PACKAGES,
        freeMessages: FREE_MESSAGES,
        tokenCa: TOKEN_CA,
        pumpUrl: PUMP_URL,
        aiProvider: activeProvider(),
      }),

    "/api/account": (req) => {
      const wallet = new URL(req.url).searchParams.get("wallet");
      if (!wallet) return json({ error: "wallet required" }, 400);
      const acc = getAccount(wallet);
      return json({
        wallet: acc.wallet,
        credits: acc.credits,
        freeLeft: Math.max(0, FREE_MESSAGES - acc.free_used),
        msgCount: messageCount(wallet),
      });
    },

    "/api/stats": () => {
      const s = getStats();
      return json({
        aiMessages: s.aiMessages,
        operators: s.operators,
        solIn: s.lamportsIn / 1_000_000_000,
        payments: s.payments,
      });
    },

    "/api/chat": {
      POST: async (req, srv) => {
        const ip =
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          srv.requestIP(req)?.address ||
          "unknown";
        if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

        let body: { message?: string; wallet?: string };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const message = (body.message ?? "").trim().slice(0, 300);
        if (!message) return json({ error: "message required" }, 400);

        if (!activeProvider()) {
          // No free LLM configured — the client falls back to local rules.
          return json({ source: "rules" });
        }

        const wallet = body.wallet?.trim();
        const allowed = wallet
          ? useWalletMessage(wallet, FREE_MESSAGES)
          : useIpMessage(ip, FREE_MESSAGES);
        if (!allowed) {
          return json(
            { error: wallet ? "no_credits" : "connect_wallet" },
            402,
          );
        }

        try {
          const sessionKey = wallet || `ip:${ip}`;
          const result = await think(message, getHistory(sessionKey));
          if (!result) return json({ source: "rules" });
          appendTurns(sessionKey, [
            { role: "user", content: message },
            { role: "assistant", content: result.reply },
          ]);
          const remaining = wallet
            ? (() => {
                const acc = getAccount(wallet);
                return {
                  credits: acc.credits,
                  freeLeft: Math.max(0, FREE_MESSAGES - acc.free_used),
                };
              })()
            : { credits: 0, freeLeft: Math.max(0, FREE_MESSAGES - ipFreeUsed(ip)) };
          return json({ source: "ai", ...result, remaining });
        } catch (err) {
          console.error("brain error:", err);
          return json({ source: "rules", brainDown: true });
        }
      },
    },

    "/api/verify-payment": {
      POST: async (req) => {
        if (!TREASURY) return json({ error: "treasury_not_configured" }, 503);

        let body: { signature?: string; wallet?: string };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const { signature, wallet } = body;
        if (!signature || !wallet) {
          return json({ error: "signature and wallet required" }, 400);
        }
        if (paymentExists(signature)) return json({ error: "already_redeemed" }, 409);

        try {
          const { lamports } = await verifyTransfer(signature, wallet, TREASURY);
          const credits = creditsForLamports(lamports);
          if (credits <= 0) return json({ error: "amount_too_small" }, 400);
          const acc = recordPayment(signature, wallet, lamports, credits);
          return json({
            ok: true,
            creditsAdded: credits,
            credits: acc.credits,
            freeLeft: Math.max(0, FREE_MESSAGES - acc.free_used),
          });
        } catch (err) {
          return json({ error: String(err instanceof Error ? err.message : err) }, 400);
        }
      },
    },
  },
  development:
    process.env.NODE_ENV === "production"
      ? false
      : {
          hmr: true,
          console: true,
        },
});

console.log(`HYLUXTIC dev server → ${server.url}`);
console.log(
  `  AI brain: ${activeProvider() ?? "none (rule-based fallback — set GROQ_API_KEY / GEMINI_API_KEY / OLLAMA_URL, all free)"}`,
);
console.log(`  Treasury: ${TREASURY || "not set (top-up disabled)"}`);
