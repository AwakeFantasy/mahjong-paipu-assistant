import { describe, expect, it } from "vitest";

import { analyzeOffensiveEv } from "./offensive-ev";

describe("analyzeOffensiveEv", () => {
  it("scores tenpai discards with waits and approximate points", async () => {
    const analysis = await analyzeOffensiveEv({
      tiles: ["2m", "3m", "4m", "2p", "3p", "4p", "6s", "7s", "5m", "5m", "6p", "7p", "8p", "9s"],
      doraIndicators: ["4m"],
    });

    expect(analysis.status).toBe("ready");
    expect(analysis.options.length).toBeGreaterThan(0);
    expect(analysis.options[0].offensiveEv).toBeGreaterThan(0);
    expect(analysis.options[0].averageScore).toBeGreaterThanOrEqual(1000);
  });

  it("expands one-shanten branches before assigning offensive EV", async () => {
    const analysis = await analyzeOffensiveEv({
      tiles: ["2m", "3m", "4m", "2p", "3p", "4p", "6s", "7s", "5m", "5m", "6p", "7p", "1z", "1z"],
      doraIndicators: ["4m"],
    });
    const withBranches = analysis.options.find((option) => option.branches.length > 0);

    expect(analysis.status).toBe("ready");
    expect(withBranches).toBeTruthy();
    expect(withBranches?.offensiveEv).toBeGreaterThan(0);
  });

  it("uses beam search for deeper shanten candidates", async () => {
    const analysis = await analyzeOffensiveEv({
      tiles: ["2m", "3m", "4m", "2p", "3p", "6s", "7s", "5m", "5m", "6p", "1z", "1z", "3z", "4z"],
      doraIndicators: ["4m"],
      maxDepth: 2,
      beamWidth: 3,
    });
    const deepOption = analysis.options.find((option) => option.shantenAfterDiscard >= 2 && option.branches.length > 0);

    expect(analysis.status).toBe("ready");
    expect(deepOption).toBeTruthy();
    expect(deepOption?.offensiveEv).toBeGreaterThan(0);
  });

  it("keeps distant 6s vs 7s candidates non-zero even when immediate ukeire is empty", async () => {
    const analysis = await analyzeOffensiveEv({
      tiles: ["2m", "3m", "3m", "4m", "5m", "6s", "7s", "8s", "2p", "3p", "4p"],
      visibleTiles: ["9p", "4s", "6s", "7s"],
      doraIndicators: ["4p"],
    });
    const discard6s = analysis.options.find((option) => option.discard === "6s");
    const discard7s = analysis.options.find((option) => option.discard === "7s");

    expect(analysis.status).toBe("ready");
    expect(discard6s?.waits).toEqual([]);
    expect(discard7s?.waits).toEqual([]);
    expect(discard6s?.averageScore).toBeGreaterThan(0);
    expect(discard7s?.averageScore).toBeGreaterThan(0);
    expect(discard6s?.offensiveEv).toBeGreaterThan(0);
    expect(discard7s?.offensiveEv).toBeGreaterThan(0);
  });

  it("does not let distant-hand route scores outrank closer EV candidates", async () => {
    const analysis = await analyzeOffensiveEv({
      tiles: ["2m", "3m", "4m", "2p", "3p", "6s", "7s", "5m", "5m", "6p", "1z", "1z", "3z", "4z"],
      doraIndicators: ["4m"],
      maxDepth: 2,
      beamWidth: 3,
    });
    const distantOptions = analysis.options.filter((option) => option.shantenAfterDiscard > 1);

    for (let index = 1; index < distantOptions.length; index += 1) {
      const previous = distantOptions[index - 1];
      const current = distantOptions[index];
      expect(previous.shantenAfterDiscard).toBeLessThanOrEqual(current.shantenAfterDiscard);
      if (previous.shantenAfterDiscard === current.shantenAfterDiscard) {
        expect(previous.ukeire).toBeGreaterThanOrEqual(current.ukeire);
      }
    }
  });

  it("discounts self-discard furiten waits", async () => {
    const baseline = await analyzeOffensiveEv({
      tiles: ["2m", "3m", "4m", "2p", "3p", "4p", "6s", "7s", "5m", "5m", "6p", "7p", "8p", "9s"],
      doraIndicators: ["4m"],
    });
    const tenpai = baseline.options.find((option) => option.waits.length > 0);
    expect(tenpai).toBeTruthy();

    const furiten = await analyzeOffensiveEv({
      tiles: ["2m", "3m", "4m", "2p", "3p", "4p", "6s", "7s", "5m", "5m", "6p", "7p", "8p", "9s"],
      doraIndicators: ["4m"],
      ownDiscards: [tenpai?.waits[0] ?? ""],
    });
    const sameDiscard = furiten.options.find((option) => option.discard === tenpai?.discard);

    expect(sameDiscard?.furitenWaits).toContain(tenpai?.waits[0]);
    expect(sameDiscard?.offensiveEv ?? 0).toBeLessThan(tenpai?.offensiveEv ?? 0);
  });
});
