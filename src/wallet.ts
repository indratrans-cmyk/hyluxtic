/* Phantom wallet helpers — non-custodial SOL payments straight to the treasury. */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  connect(opts?: {
    onlyIfTrusted?: boolean;
  }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
}

export function getPhantom(): PhantomProvider | null {
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  };
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana;
  if (w.solana?.isPhantom) return w.solana;
  return null;
}

export async function connectWallet(): Promise<string> {
  const provider = getPhantom();
  if (!provider) {
    throw new Error("Phantom wallet not found — install it from phantom.app");
  }
  const { publicKey } = await provider.connect();
  return publicKey.toString();
}

export function shortAddress(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

async function awaitConfirmation(connection: Connection, signature: string) {
  for (let i = 0; i < 30; i++) {
    const status = await connection.getSignatureStatus(signature);
    const conf = status.value?.confirmationStatus;
    if (status.value?.err) throw new Error("transaction failed on-chain");
    if (conf === "confirmed" || conf === "finalized") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("confirmation timed out — check the transaction in your wallet");
}

/** Send `uiAmount` of the SPL token `mint` to the treasury's token account. */
export async function payToken(
  rpcUrl: string,
  treasury: string,
  mint: string,
  decimals: number,
  uiAmount: number,
  payer: string,
): Promise<string> {
  const provider = getPhantom();
  if (!provider) throw new Error("Phantom wallet not found");

  const connection = new Connection(rpcUrl, "confirmed");
  const from = new PublicKey(payer);
  const mintKey = new PublicKey(mint);
  const treasuryKey = new PublicKey(treasury);
  const fromAta = getAssociatedTokenAddressSync(mintKey, from);
  const toAta = getAssociatedTokenAddressSync(mintKey, treasuryKey);
  const raw = BigInt(Math.round(uiAmount * 10 ** decimals));

  const tx = new Transaction().add(
    // Creates the treasury's token account if it doesn't exist yet (buyer pays rent once).
    createAssociatedTokenAccountIdempotentInstruction(from, toAta, treasuryKey, mintKey),
    createTransferCheckedInstruction(fromAta, mintKey, toAta, from, raw, decimals),
  );
  tx.feePayer = from;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;

  const { signature } = await provider.signAndSendTransaction(tx);
  await awaitConfirmation(connection, signature);
  return signature;
}

/** Send `lamports` from the connected wallet to `treasury`; resolves to the tx signature once confirmed. */
export async function paySol(
  rpcUrl: string,
  treasury: string,
  lamports: number,
  payer: string,
): Promise<string> {
  const provider = getPhantom();
  if (!provider) throw new Error("Phantom wallet not found");

  const connection = new Connection(rpcUrl, "confirmed");
  const from = new PublicKey(payer);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: new PublicKey(treasury),
      lamports: Math.round(lamports),
    }),
  );
  tx.feePayer = from;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;

  const { signature } = await provider.signAndSendTransaction(tx);
  await awaitConfirmation(connection, signature);
  return signature;
}
