import { describe, expect, it } from "vitest";

import { analyzeRouteFactors, compareRouteFactors } from "./route-factors";

describe("route factors", () => {
  it("recognizes tanyao retention after removing a terminal", () => {
    const [discard1m] = analyzeRouteFactors({
      tiles: ["1m", "2m", "3m", "4m", "5m", "6m", "2p", "3p", "4p", "6s", "7s", "8s", "9s", "5p"],
      candidateDiscards: ["1m"],
    });

    expect(discard1m.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: "tanyao" }),
      ]),
    );
  });

  it("marks yakuhai retention and loss", () => {
    const analyses = analyzeRouteFactors({
      tiles: ["5z", "5z", "2m", "3m", "4m", "5m", "6m", "2p", "3p", "4p", "6s", "7s", "8s", "9s"],
      candidateDiscards: ["9s", "5z"],
      seatWind: "E",
      roundWind: "S",
    });
    const discard9s = analyses.find((item) => item.discard === "9s");
    const discard5z = analyses.find((item) => item.discard === "5z");

    expect(discard9s?.routes.find((route) => route.route === "yakuhai")).toMatchObject({ strength: "strong" });
    expect(discard5z?.routes.find((route) => route.route === "yakuhai")?.lostByDiscard).toContain("白");
  });

  it("recognizes honitsu when one suit and honors dominate", () => {
    const [discard4p] = analyzeRouteFactors({
      tiles: ["1s", "2s", "3s", "5s", "6s", "7s", "8s", "9s", "5z", "5z", "6z", "7z", "4p", "8p"],
      candidateDiscards: ["4p"],
    });

    expect(discard4p.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: "honitsu" }),
      ]),
    );
  });

  it("recognizes chiitoi pair preservation", () => {
    const analyses = analyzeRouteFactors({
      tiles: ["1m", "1m", "3m", "3m", "5p", "5p", "7s", "7s", "2m", "4m", "6p", "8s", "5z", "6z"],
      candidateDiscards: ["2m", "1m"],
    });
    const discard2m = analyses.find((item) => item.discard === "2m");
    const discard1m = analyses.find((item) => item.discard === "1m");

    expect(discard2m?.routes.find((route) => route.route === "chiitoi")).toMatchObject({ strength: "medium" });
    expect(discard1m?.routes.find((route) => route.route === "chiitoi")?.lostByDiscard).toContain("1万");
  });

  it("compares candidate discards by stable route evidence", () => {
    const analyses = analyzeRouteFactors({
      tiles: ["1m", "1m", "3m", "3m", "5p", "5p", "7s", "7s", "2m", "4m", "6p", "8s", "5z", "6z"],
      candidateDiscards: ["2m", "1m"],
    });
    const comparison = compareRouteFactors(
      analyses.find((item) => item.discard === "2m"),
      analyses.find((item) => item.discard === "1m"),
    );

    expect(comparison).toMatchObject({
      preferredDiscardTile: "2m",
      preferredKeepTile: "1m",
    });
    expect(comparison?.summary).toContain("七对子");
  });
});
