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
      provider: "majsoul",
    });
  });

  it("parses an international url and target seat", () => {
    const source = parsePaipuSource(
      "https://mahjongsoul.game.yo-star.com/?paipu=240101-11111111-2222-4333-8444-555555555555_a123&tw=2",
    );

    expect(source).toMatchObject({
      id: "240101-11111111-2222-4333-8444-555555555555",
      region: "en",
      provider: "majsoul",
      targetSeat: 2,
    });
  });

  it("parses a tenhou log url", () => {
    const source = parsePaipuSource("https://tenhou.net/0/?log=2016031919gm-0009-0000-490705b1&tw=3");

    expect(source).toMatchObject({
      id: "2016031919gm-0009-0000-490705b1",
      region: "tenhou",
      provider: "tenhou",
      targetSeat: 3,
    });
  });

  it("parses a tenhou direct log endpoint", () => {
    const source = parsePaipuSource("https://tenhou.net/0/log/?2016031919gm-0009-0000-490705b1");

    expect(source).toMatchObject({
      id: "2016031919gm-0009-0000-490705b1",
      region: "tenhou",
      provider: "tenhou",
    });
  });

  it("parses a raw tenhou log id", () => {
    const source = parsePaipuSource("2016031919gm-0009-0000-490705b1", 1);

    expect(source).toMatchObject({
      id: "2016031919gm-0009-0000-490705b1",
      region: "tenhou",
      provider: "tenhou",
      targetSeat: 1,
    });
  });

  it("parses a raw riichi city log id and target seat suffix", () => {
    const source = parsePaipuSource("ch35u1e9nc70954ah9n0@3");

    expect(source).toMatchObject({
      id: "ch35u1e9nc70954ah9n0",
      region: "riichi-city",
      provider: "riichi-city",
      targetSeat: 3,
    });
  });

  it("parses a citylogs url", () => {
    const source = parsePaipuSource("https://rc.honk.li/?log_id=ch35u1e9nc70954ah9n0&seat=1");

    expect(source).toMatchObject({
      id: "ch35u1e9nc70954ah9n0",
      region: "riichi-city",
      provider: "riichi-city",
      targetSeat: 1,
    });
  });

  it("rejects invalid input", () => {
    expect(() => parsePaipuSource("not a paipu url")).toThrow("无法识别");
  });
});
