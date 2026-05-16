import { describe, expect, it } from "vitest";

import { parsePaipuSource } from "./url";

describe("parsePaipuSource", () => {
  it("parses a cn majsoul paipu url", () => {
    const source = parsePaipuSource(
      "https://game.maj-soul.com/1/?paipu=240101-11111111-2222-4333-8444-555555555555",
    );

    expect(source).toMatchObject({
      id: "240101-11111111-2222-4333-8444-555555555555",
      region: "cn",
    });
  });

  it("parses an international url and target seat", () => {
    const source = parsePaipuSource(
      "https://mahjongsoul.game.yo-star.com/?paipu=240101-11111111-2222-4333-8444-555555555555_a123&tw=2",
    );

    expect(source).toMatchObject({
      id: "240101-11111111-2222-4333-8444-555555555555",
      region: "en",
      targetSeat: 2,
    });
  });

  it("rejects invalid input", () => {
    expect(() => parsePaipuSource("not a paipu url")).toThrow("无法识别");
  });
});
