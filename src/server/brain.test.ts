import { describe, expect, test } from "bun:test";
import { sanitize, validExpression, validMove } from "./brain";

describe("sanitize — LLM output hardening", () => {
  test("clean JSON passes through", () => {
    const r = sanitize('{"reply":"Hello!","move":"Wave","expression":"Surprised"}');
    expect(r.reply).toBe("Hello!");
    expect(r.move).toBe("Wave");
    expect(r.expression).toBe("Surprised");
  });

  test("JSON wrapped in markdown fences is extracted", () => {
    const r = sanitize('```json\n{"reply":"Hi","move":"Dance","expression":"Neutral"}\n```');
    expect(r.move).toBe("Dance");
  });

  test("invalid move falls back to Idle", () => {
    const r = sanitize('{"reply":"x","move":"Backflip","expression":"Neutral"}');
    expect(r.move).toBe("Idle");
  });

  test("invalid expression falls back to Neutral", () => {
    const r = sanitize('{"reply":"x","move":"Wave","expression":"Ecstatic"}');
    expect(r.expression).toBe("Neutral");
  });

  test("garbage output produces a safe fallback reply", () => {
    const r = sanitize("SEGFAULT ‰ĢϿ");
    expect(r.reply.length).toBeGreaterThan(0);
    expect(r.move).toBe("Idle");
  });

  test("overlong replies are truncated", () => {
    const r = sanitize(JSON.stringify({ reply: "a".repeat(9999), move: "Idle" }));
    expect(r.reply.length).toBeLessThanOrEqual(400);
  });
});

describe("move/expression validators (streaming header path)", () => {
  test("valid values pass", () => {
    expect(validMove("Punch")).toBe("Punch");
    expect(validExpression("Sad")).toBe("Sad");
  });

  test("unknown or missing values fall back safely", () => {
    expect(validMove("Moonwalk")).toBe("Idle");
    expect(validMove(undefined)).toBe("Idle");
    expect(validExpression("Confused")).toBe("Neutral");
    expect(validExpression(undefined)).toBe("Neutral");
  });
});
