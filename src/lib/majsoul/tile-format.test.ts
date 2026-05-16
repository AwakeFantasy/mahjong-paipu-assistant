import { describe, expect, it } from "vitest";

import { formatTileName, formatTileNames } from "./tile-format";

describe("formatTileName", () => {
  it("formats suited tiles and honors for user-facing text", () => {
    expect(formatTileName("8m")).toBe("8万");
    expect(formatTileName("3p")).toBe("3筒");
    expect(formatTileName("9s")).toBe("9索");
    expect(formatTileName("6z")).toBe("发财");
    expect(formatTileName("7z")).toBe("红中");
  });

  it("formats red fives", () => {
    expect(formatTileName("0p")).toBe("红5筒");
    expect(formatTileName("5mr")).toBe("红5万");
  });

  it("keeps unknown values unchanged", () => {
    expect(formatTileName("bad")).toBe("bad");
    expect(formatTileNames(["8m", "6z"])).toBe("8万 发财");
  });
});
