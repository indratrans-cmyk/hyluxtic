import index from "./index.html";
import embed from "./embed.html";
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
import { verifyTokenTransfer, verifyTransfer } from "./src/server/solana";
import { creditsForLamports, FREE_MESSAGES, PACKAGES } from "./src/shared/economy";

const TREASURY = process.env.TREASURY_WALLET || "";
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const TOKEN_CA = process.env.TOKEN_CA || "";
const PUMP_URL = process.env.PUMP_URL || "https://pump.fun";
// $HLUX pay-per-use — activates when the mint is set (post pump.fun launch).
const HLUX_MINT = process.env.HLUX_MINT || "";
const HLUX_PER_CREDIT = Number(process.env.HLUX_PER_CREDIT || 0); // tokens per message credit
const HLUX_DECIMALS = Number(process.env.HLUX_DECIMALS || 6);

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
    "/embed": embed,

    "/embed.js": () =>
      new Response(Bun.file("src/embed/embed.js"), {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      }),

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
        hluxMint: HLUX_PER_CREDIT > 0 ? HLUX_MINT : "",
        hluxPerCredit: HLUX_PER_CREDIT,
        hluxDecimals: HLUX_DECIMALS,
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

        let body: { message?: string; wallet?: string; worker?: string };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const message = (body.message ?? "").trim().slice(0, 300);
        if (!message) return json({ error: "message required" }, 400);
        const workerName = body.worker === "UNIT-02" ? "UNIT-02" : "UNIT-01";

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
          const result = await think(message, getHistory(sessionKey), workerName);
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

        let body: { signature?: string; wallet?: string; token?: string };
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
          let credits: number;
          let amountRecorded: number;
          let tokenKind: "SOL" | "HLUX" = "SOL";

          if (body.token === "HLUX") {
            if (!HLUX_MINT || HLUX_PER_CREDIT <= 0) {
              return json({ error: "hlux_not_configured" }, 503);
            }
            const { uiAmount } = await verifyTokenTransfer(signature, TREASURY, HLUX_MINT);
            credits = Math.floor(uiAmount / HLUX_PER_CREDIT);
            amountRecorded = Math.round(uiAmount);
            tokenKind = "HLUX";
          } else {
            const { lamports } = await verifyTransfer(signature, wallet, TREASURY);
            credits = creditsForLamports(lamports);
            amountRecorded = lamports;
          }

          if (credits <= 0) return json({ error: "amount_too_small" }, 400);
          const acc = recordPayment(signature, wallet, amountRecorded, credits, tokenKind);
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
