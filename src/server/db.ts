import { Database } from "bun:sqlite";

const db = new Database("hyluxtic.sqlite", { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    wallet TEXT PRIMARY KEY,
    credits INTEGER NOT NULL DEFAULT 0,
    free_used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ip_free (
    ip TEXT PRIMARY KEY,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS payments (
    signature TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    lamports INTEGER NOT NULL,
    credits INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_key, id);
`);

// payments.token column for $HLUX support (added later — migrate old DBs in place)
const paymentCols = db.query<{ name: string }, []>("PRAGMA table_info(payments)").all();
if (!paymentCols.some((c) => c.name === "token")) {
  db.run("ALTER TABLE payments ADD COLUMN token TEXT NOT NULL DEFAULT 'SOL'");
}

export interface Account {
  wallet: string;
  credits: number;
  free_used: number;
}

export function getAccount(wallet: string): Account {
  db.query(
    "INSERT OR IGNORE INTO accounts (wallet, credits, free_used, created_at) VALUES (?, 0, 0, ?)",
  ).run(wallet, Date.now());
  return db
    .query<Account, [string]>(
      "SELECT wallet, credits, free_used FROM accounts WHERE wallet = ?",
    )
    .get(wallet)!;
}

export function useWalletMessage(wallet: string, freeLimit: number): boolean {
  const acc = getAccount(wallet);
  if (acc.free_used < freeLimit) {
    db.query("UPDATE accounts SET free_used = free_used + 1 WHERE wallet = ?").run(wallet);
    return true;
  }
  if (acc.credits > 0) {
    db.query("UPDATE accounts SET credits = credits - 1 WHERE wallet = ?").run(wallet);
    return true;
  }
  return false;
}

export function useIpMessage(ip: string, freeLimit: number): boolean {
  db.query("INSERT OR IGNORE INTO ip_free (ip, used) VALUES (?, 0)").run(ip);
  const row = db
    .query<{ used: number }, [string]>("SELECT used FROM ip_free WHERE ip = ?")
    .get(ip)!;
  if (row.used >= freeLimit) return false;
  db.query("UPDATE ip_free SET used = used + 1 WHERE ip = ?").run(ip);
  return true;
}

export function ipFreeUsed(ip: string): number {
  return (
    db
      .query<{ used: number }, [string]>("SELECT used FROM ip_free WHERE ip = ?")
      .get(ip)?.used ?? 0
  );
}

export function paymentExists(signature: string): boolean {
  return (
    db
      .query<{ n: number }, [string]>(
        "SELECT COUNT(*) AS n FROM payments WHERE signature = ?",
      )
      .get(signature)!.n > 0
  );
}

export function recordPayment(
  signature: string,
  wallet: string,
  lamports: number,
  credits: number,
  token: "SOL" | "HLUX" = "SOL",
): Account {
  const tx = db.transaction(() => {
    db.query(
      "INSERT INTO payments (signature, wallet, lamports, credits, created_at, token) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(signature, wallet, lamports, credits, Date.now(), token);
    getAccount(wallet);
    db.query("UPDATE accounts SET credits = credits + ? WHERE wallet = ?").run(
      credits,
      wallet,
    );
  });
  tx();
  return getAccount(wallet);
}

/* ---------- conversation memory ---------- */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const HISTORY_TURNS = 12; // sent to the LLM
const KEEP_PER_SESSION = 60; // stored per session before pruning

export function getHistory(sessionKey: string): ChatTurn[] {
  const rows = db
    .query<{ role: string; content: string }, [string, number]>(
      "SELECT role, content FROM messages WHERE session_key = ? ORDER BY id DESC LIMIT ?",
    )
    .all(sessionKey, HISTORY_TURNS);
  return rows.reverse().map((r) => ({
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
  }));
}

export function appendTurns(sessionKey: string, turns: ChatTurn[]) {
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const t of turns) {
      db.query(
        "INSERT INTO messages (session_key, role, content, created_at) VALUES (?, ?, ?, ?)",
      ).run(sessionKey, t.role, t.content, now);
    }
    db.query(
      `DELETE FROM messages WHERE session_key = ? AND id NOT IN (
         SELECT id FROM messages WHERE session_key = ? ORDER BY id DESC LIMIT ?
       )`,
    ).run(sessionKey, sessionKey, KEEP_PER_SESSION);
  });
  tx();
}

export function messageCount(sessionKey: string): number {
  return db
    .query<{ n: number }, [string]>(
      "SELECT COUNT(*) AS n FROM messages WHERE session_key = ?",
    )
    .get(sessionKey)!.n;
}

/* ---------- transparency stats ---------- */

export interface Stats {
  aiMessages: number;
  operators: number;
  lamportsIn: number;
  payments: number;
}

export function getStats(): Stats {
  const aiMessages = db
    .query<{ n: number }, []>(
      "SELECT COUNT(*) AS n FROM messages WHERE role = 'assistant'",
    )
    .get()!.n;
  const operators = db
    .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM accounts")
    .get()!.n;
  const pay = db
    .query<{ total: number | null; n: number }, []>(
      "SELECT SUM(lamports) AS total, COUNT(*) AS n FROM payments WHERE token = 'SOL'",
    )
    .get()!;
  return {
    aiMessages,
    operators,
    lamportsIn: pay.total ?? 0,
    payments: pay.n,
  };
}
