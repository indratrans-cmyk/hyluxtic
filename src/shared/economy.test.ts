import { describe, expect, test } from "bun:test";
import {
  creditsForLamports,
  LAMPORTS_PER_CREDIT,
  LAMPORTS_PER_SOL,
  PACKAGES,
} from "./economy";

describe("creditsForLamports", () => {
  test("exact package amounts grant package credits", () => {
    for (const p of PACKAGES) {
      expect(creditsForLamports(p.lamports)).toBe(p.credits);
    }
  });

  test("tolerates ±2% around a package (network fee wiggle)", () => {
    const p = PACKAGES[0]!;
    expect(creditsForLamports(p.lamports * 1.019)).toBe(p.credits);
    expect(creditsForLamports(p.lamports * 0.981)).toBe(p.credits);
  });

  test("outside tolerance falls back to the flat rate", () => {
    const p = PACKAGES[0]!;
    const paid = Math.round(p.lamports * 1.5);
    expect(creditsForLamports(paid)).toBe(Math.floor(paid / LAMPORTS_PER_CREDIT));
  });

  test("dust amounts grant zero credits", () => {
    expect(creditsForLamports(1000)).toBe(0);
  });

  test("packages are sane: bigger package = cheaper per credit", () => {
    const perCredit = PACKAGES.map((p) => p.lamports / p.credits);
    for (let i = 1; i < perCredit.length; i++) {
      expect(perCredit[i]!).toBeLessThanOrEqual(perCredit[i - 1]!);
    }
  });

  test("all package prices are below 1 SOL (impulse-buy range)", () => {
    for (const p of PACKAGES) {
      expect(p.lamports).toBeLessThan(LAMPORTS_PER_SOL);
    }
  });
});
