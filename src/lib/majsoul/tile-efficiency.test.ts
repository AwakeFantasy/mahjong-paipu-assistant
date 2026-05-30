import { describe, expect, it } from "vitest";

import { analyzeTileEfficiency } from "./tile-efficiency";

describe("analyzeTileEfficiency", () => {
  it("keeps open-hand 11-tile discard shanten accurate", () => {
    const analysis = analyzeTileEfficiency(["2m", "3m", "4m", "5m", "0m", "2s", "4s", "6s", "7s", "8s", "3m"]);
    const discard3m = analysis.discardOptions.find((option) => option.discard === "3m");
    const discard4s = analysis.discardOptions.find((option) => option.discard === "4s");

    expect(analysis.status).toBe("ready");
    expect(analysis.tileCount).toBe(11);
    expect(analysis.shanten).toBe(0);
    expect(discard3m).toMatchObject({ shantenAfterDiscard: 0, waitCount: 4 });
    expect(discard4s).toMatchObject({ shantenAfterDiscard: 1, waitCount: 0 });
  });
});
