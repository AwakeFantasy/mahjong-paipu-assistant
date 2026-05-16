import { describe, expect, it } from "vitest";

import { eventProgressLabel, eventSeatLabel, eventTypeLabel, formatRoundEvent, seatName } from "./event-format";
import type { Player, RoundEvent } from "@/lib/majsoul/types";

const players: Player[] = [0, 1, 2, 3].map((seat) => ({
  seat: seat as 0 | 1 | 2 | 3,
  wind: ["E", "S", "W", "N"][seat] as Player["wind"],
  name: ["刹那の未来。", "小瑜2", "KayleJax", "awakefantasy"][seat],
  startScore: 25000,
  score: "25,000",
  style: "测试",
}));

describe("event formatting", () => {
  it("formats the initial state labels without an event", () => {
    expect(eventTypeLabel()).toBe("起手");
  });

  it("formats draw, discard, call, kan, agari and ryukyoku events", () => {
    const cases: Array<[RoundEvent, string, string]> = [
      [{ type: "draw", seat: 0, tile: "2z" }, "东家 刹那の未来。 摸 南", "摸牌"],
      [{ type: "discard", seat: 0, tile: "2z", moqie: true, riichi: true }, "东家 刹那の未来。 切 南（摸切），立直", "切牌"],
      [{ type: "call", seat: 2, callType: "碰", tiles: ["9p", "9p", "9p"], froms: [1, 2, 2] }, "西家 KayleJax 碰 9筒 9筒 9筒", "副露"],
      [{ type: "kan", seat: 3, callType: "暗杠", tiles: ["1z", "1z", "1z", "1z"] }, "北家 awakefantasy 暗杠 东 东 东 东", "杠"],
      [{ type: "agari", seat: 2, zimo: false, tile: "9p", title: "断幺", point: 8000 }, "西家 KayleJax 荣和 断幺 8000", "和了"],
      [{ type: "ryukyoku", label: "流局" }, "流局", "流局"],
    ];

    for (const [event, expectedText, expectedType] of cases) {
      expect(formatRoundEvent(event, players)).toBe(expectedText);
      expect(eventTypeLabel(event)).toBe(expectedType);
    }
  });

  it("formats seat labels and settlement labels", () => {
    expect(seatName(0, players)).toBe("东家 刹那の未来。");
    expect(eventSeatLabel({ type: "discard", seat: 1, tile: "3m", moqie: false, riichi: false }, players)).toBe("南家 小瑜2");
    expect(eventSeatLabel({ type: "ryukyoku", label: "流局" }, players)).toBe("结算");
  });

  it("formats progress without making the starting state look like an event", () => {
    expect(eventProgressLabel(0, 109)).toBe("起手状态");
    expect(eventProgressLabel(2, 109)).toBe("2 / 109");
    expect(eventProgressLabel(200, 109)).toBe("109 / 109");
    expect(eventProgressLabel(Number.NaN, 109)).toBe("起手状态");
    expect(eventProgressLabel(0, 0)).toBe("无事件");
  });
});
