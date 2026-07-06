import { describe, expect, test } from "bun:test";
import { interpret } from "./commands";

describe("interpret — local rule engine", () => {
  test("English gesture commands match", () => {
    const d = interpret("dance for me!");
    expect(d.matched).toBe(true);
    expect(d.move).toBe("Dance");
  });

  test("Indonesian gesture commands match", () => {
    expect(interpret("joget dong").move).toBe("Dance");
    expect(interpret("coba tinju").move).toBe("Punch");
    expect(interpret("lompat!").move).toBe("Jump");
  });

  test("theme switching", () => {
    expect(interpret("ganti ke aurum").themeId).toBe("aurum");
    expect(interpret("go violet").themeId).toBe("violet");
  });

  test("expressions", () => {
    expect(interpret("kamu marah?").expression).toBe("Angry");
    expect(interpret("so sad").expression).toBe("Sad");
  });

  test("help lists commands", () => {
    const d = interpret("help");
    expect(d.matched).toBe(true);
    expect(d.reply).toContain("dance");
  });

  test("free-form talk is NOT matched — goes to the AI brain", () => {
    expect(interpret("what do you think about the solana ecosystem?").matched).toBe(false);
    expect(interpret("ceritakan tentang dirimu lebih dalam").matched).toBe(false);
  });

  test("demo command enables autopilot", () => {
    expect(interpret("demo").demo).toBe(true);
  });

  test("stop resets to idle and disables autopilot", () => {
    const d = interpret("stop");
    expect(d.move).toBe("Idle");
    expect(d.demo).toBe(false);
  });
});
