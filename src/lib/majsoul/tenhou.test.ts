import { describe, expect, it } from "vitest";

import { normalizeMjsoulGame } from "./normalize";
import { parseTenhouXml } from "./tenhou";
import type { PaipuSource } from "./types";

const source: PaipuSource = {
  id: "2016031919gm-0009-0000-490705b1",
  url: "https://tenhou.net/0/?log=2016031919gm-0009-0000-490705b1",
  region: "tenhou",
  provider: "tenhou",
  targetSeat: 0,
};

const xml = `
<mjloggm ver="2.3">
  <GO type="169" />
  <UN n0="Alice" n1="Bob" n2="Carol" n3="Dave" />
  <INIT seed="0,0,0,1,2,16" ten="250,250,250,250" oya="0" hai0="0,4,8,12,16,20,24,28,32,36,40,44,48" hai1="52,56,60,64,68,72,76,80,84,88,92,96,100" hai2="1,5,9,13,17,21,25,29,33,37,41,45,49" hai3="53,57,61,65,69,73,77,81,85,89,93,97,101" />
  <T108 />
  <D108 />
  <U109 />
  <E109 />
  <REACH who="0" step="1" />
  <T112 />
  <D112 />
  <AGARI who="0" fromWho="0" machi="112" ten="30,1000,0" sc="250,10,250,0,250,0,250,-10" />
  <INIT seed="1,0,0,1,2,52" ten="260,250,250,240" oya="1" hai0="0,4,8,12,16,20,24,28,32,36,40,44,48" hai1="52,56,60,64,68,72,76,80,84,88,92,96,100" hai2="1,5,9,13,17,21,25,29,33,37,41,45,49" hai3="53,57,61,65,69,73,77,81,85,89,93,97,101" />
  <W32 />
  <G0 />
  <N who="2" m="105" />
  <RYUUKYOKU hai0="0,4,8" hai2="1,5,9" sc="260,0,250,0,250,15,240,-15" owari="260,10,250,0,265,15,225,-25" />
</mjloggm>
`;

describe("parseTenhouXml", () => {
  it("converts tenhou xml into the shared raw game shape", () => {
    const game = parseTenhouXml(source, xml);

    expect(game.head?.accounts).toEqual([
      { seat: 0, nickname: "Alice" },
      { seat: 1, nickname: "Bob" },
      { seat: 2, nickname: "Carol" },
      { seat: 3, nickname: "Dave" },
    ]);
    expect(game.records.map((record) => record.name)).toContain("RecordNewRound");
    expect(game.records.map((record) => record.name)).toContain("RecordChiPengGang");
    expect(game.records.map((record) => record.name)).toContain("RecordHule");
    expect(game.records.map((record) => record.name)).toContain("RecordNoTile");
  });

  it("reuses the existing normalize/playback contract", () => {
    const result = normalizeMjsoulGame(source, parseTenhouXml(source, xml));

    expect(result.players.map((player) => player.name)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].initialHands[0]).toContain("0m");
    expect(result.rounds[0].events.some((event) => event.type === "discard" && event.riichi)).toBe(true);
    expect(result.rounds[1].events.some((event) => event.type === "call")).toBe(true);
    expect(result.rounds[1].result).toContain("流局");
  });
});
