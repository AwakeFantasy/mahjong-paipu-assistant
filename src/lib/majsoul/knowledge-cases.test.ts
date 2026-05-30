import { describe, expect, it } from "vitest";

import { ANALYSIS_KNOWLEDGE_CASES, retrieveKnowledgeCases } from "./knowledge-cases";

describe("analysis knowledge cases", () => {
  it("keeps cases source-backed and auditable", () => {
    expect(ANALYSIS_KNOWLEDGE_CASES.length).toBeGreaterThanOrEqual(8);
    expect(ANALYSIS_KNOWLEDGE_CASES.length).toBeLessThanOrEqual(20);

    for (const item of ANALYSIS_KNOWLEDGE_CASES) {
      expect(item.id).toBeTruthy();
      expect(item.positiveExplanation.length).toBeGreaterThan(20);
      expect(item.requiredFacts.length).toBeGreaterThan(0);
      expect(item.negativeClaims.length).toBeGreaterThan(0);
      expect(item.sources?.length).toBeGreaterThan(0);
      expect(item.sources?.every((source) => source.url.startsWith("https://"))).toBe(true);
    }
  });

  it("retrieves the white and green dragon dora-potential correction", () => {
    const cases = retrieveKnowledgeCases({
      intent: "user_correction",
      focusTiles: ["5z", "6z", "7z"],
      question: "这个地方其实是因为白板发财牌效相同，但发财的宝牌指示牌是白板，白板的宝牌指示牌红中还没见。",
    });

    expect(cases.map((item) => item.id)).toContain("same-efficiency-white-green-dragon-dora-potential");
    expect(cases[0].id).toBe("same-efficiency-white-green-dragon-dora-potential");
    expect(cases[0].sources?.map((source) => source.title).join(" ")).toContain("Dora");
  });

  it("retrieves defense boundary cases for riichi safety questions", () => {
    const cases = retrieveKnowledgeCases({
      intent: "safety_check",
      focusTiles: [],
      question: "对面立直了，这张是筋牌但不是现物，能不能当安牌？",
    });

    expect(cases.map((item) => item.id)).toContain("genbutsu-is-stronger-than-suji");
    expect(cases.map((item) => item.id)).toContain("suji-does-not-cover-closed-or-edge-waits");
  });

  it("retrieves secondary-factor guidance for same-efficiency comparisons", () => {
    const cases = retrieveKnowledgeCases({
      intent: "compare_candidate_discards",
      focusTiles: [],
      question: "两张牌牌效相同、受入相同，为什么还要选其中一张？",
    });

    expect(cases.map((item) => item.id)).toContain("tile-efficiency-same-waits-need-secondary-factors");
  });
  it("retrieves placement-context cases for avoid-4 and scoring questions", () => {
    const cases = retrieveKnowledgeCases({
      intent: "placement_strategy",
      focusTiles: [],
      question: "现在是南场二本场，为什么这手不能只看牌效？我想知道避4和打点该怎么选。",
    });

    expect(cases.map((item) => item.id)).toContain("placement-sensitive-avoid-four-needs-round-context");
    expect(cases[0].requiredFacts.join(" ")).toContain("本场");
  });

});
