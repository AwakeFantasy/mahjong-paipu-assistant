import { describe, expect, it } from "vitest";

import { getLocalTileImagePath, normalizeTileImageCode } from "./tile-images";

describe("tile image normalization", () => {
  it("keeps local tile codes unchanged", () => {
    expect(normalizeTileImageCode("1m")).toBe("1m");
    expect(normalizeTileImageCode("0p")).toBe("0p");
    expect(getLocalTileImagePath("7z")).toBe("/mahjong-tiles/7z.svg");
  });

  it("normalizes mjai honor and red-five codes", () => {
    expect(normalizeTileImageCode("E")).toBe("1z");
    expect(normalizeTileImageCode("P")).toBe("5z");
    expect(normalizeTileImageCode("C")).toBe("7z");
    expect(normalizeTileImageCode("5mr")).toBe("0m");
    expect(getLocalTileImagePath("5pr")).toBe("/mahjong-tiles/0p.svg");
  });

  it("normalizes tenhou numeric tile codes", () => {
    expect(normalizeTileImageCode("11")).toBe("1m");
    expect(normalizeTileImageCode("29")).toBe("9p");
    expect(normalizeTileImageCode("35")).toBe("5s");
    expect(normalizeTileImageCode("45")).toBe("5z");
    expect(normalizeTileImageCode("48")).toBeUndefined();
  });
});
