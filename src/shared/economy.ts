/* Single source of truth for the pay-per-use economy.
   Imported by BOTH the Bun server (verification) and the frontend (display). */

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Free AI messages before payment is required (per wallet, or per IP if no wallet). */
export const FREE_MESSAGES = 5;

export interface CreditPackage {
  id: string;
  label: string;
  sol: number;
  lamports: number;
  credits: number; // AI messages granted
  tag?: string;
}

export const PACKAGES: CreditPackage[] = [
  {
    id: "spark",
    label: "Spark",
    sol: 0.01,
    lamports: 0.01 * LAMPORTS_PER_SOL,
    credits: 30,
  },
  {
    id: "surge",
    label: "Surge",
    sol: 0.05,
    lamports: 0.05 * LAMPORTS_PER_SOL,
    credits: 180,
    tag: "popular",
  },
  {
    id: "overdrive",
    label: "Overdrive",
    sol: 0.2,
    lamports: 0.2 * LAMPORTS_PER_SOL,
    credits: 900,
    tag: "best value",
  },
];

/** Fallback rate when a payment doesn't match a package: lamports per credit. */
export const LAMPORTS_PER_CREDIT = 350_000;

/** Match a paid amount to a package (±2% tolerance), else fall back to the flat rate. */
export function creditsForLamports(lamports: number): number {
  for (const p of PACKAGES) {
    if (Math.abs(lamports - p.lamports) <= p.lamports * 0.02) return p.credits;
  }
  return Math.floor(lamports / LAMPORTS_PER_CREDIT);
}
