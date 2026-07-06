/* SOL payment verification via free public JSON-RPC — no paid services.
   Non-custodial: users pay straight to TREASURY_WALLET; we only verify on-chain. */

const RPC_URL = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

/** How old a transaction may be and still count (blocks replaying ancient txs). */
const MAX_AGE_SECONDS = 2 * 60 * 60;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const data = (await res.json()) as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(`rpc: ${data.error.message}`);
  return data.result as T;
}

interface ParsedInstruction {
  program?: string;
  parsed?: {
    type?: string;
    info?: { source?: string; destination?: string; lamports?: number };
  };
}

interface ParsedTx {
  blockTime?: number | null;
  meta?: { err: unknown } | null;
  transaction?: { message?: { instructions?: ParsedInstruction[] } };
}

export interface VerifiedPayment {
  lamports: number;
}

/**
 * Verify that `signature` is a confirmed SOL transfer from `wallet` to `treasury`.
 * Returns the amount, or throws with a human-readable reason.
 */
export async function verifyTransfer(
  signature: string,
  wallet: string,
  treasury: string,
): Promise<VerifiedPayment> {
  const tx = await rpc<ParsedTx | null>("getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    },
  ]);

  if (!tx) throw new Error("transaction not found (not confirmed yet? retry shortly)");
  if (tx.meta?.err) throw new Error("transaction failed on-chain");

  const age = Date.now() / 1000 - (tx.blockTime ?? 0);
  if (!tx.blockTime || age > MAX_AGE_SECONDS) {
    throw new Error("transaction too old to redeem");
  }

  let lamports = 0;
  for (const ins of tx.transaction?.message?.instructions ?? []) {
    if (
      ins.program === "system" &&
      ins.parsed?.type === "transfer" &&
      ins.parsed.info?.destination === treasury &&
      ins.parsed.info?.source === wallet &&
      typeof ins.parsed.info.lamports === "number"
    ) {
      lamports += ins.parsed.info.lamports;
    }
  }

  if (lamports <= 0) {
    throw new Error("no SOL transfer to the treasury found in this transaction");
  }
  return { lamports };
}
