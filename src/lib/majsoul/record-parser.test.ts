import { describe, expect, it } from "vitest";
import protobuf from "protobufjs";
import liqiSchema from "mjsoul/liqi.json";

import { parseMjsoulRecordBuffer } from "./record-parser";

const root = protobuf.Root.fromJSON(liqiSchema as protobuf.INamespace);
const wrapperType = root.lookupType("Wrapper");
const gameDetailRecordsType = root.lookupType("GameDetailRecords");

describe("parseMjsoulRecordBuffer", () => {
  it("parses legacy records", () => {
    const payload = encodeGameDetailRecords({
      records: [encodeRecord("RecordNewRound", { chang: 0, ju: 0, ben: 0, scores: [25000, 25000, 25000, 25000] })],
    });

    expect(parseMjsoulRecordBuffer(payload)).toMatchObject([
      {
        name: "RecordNewRound",
        data: { chang: 0, ju: 0, ben: 0, scores: [25000, 25000, 25000, 25000] },
      },
    ]);
  });

  it("parses action-based records", () => {
    const payload = encodeGameDetailRecords({
      actions: [
        { type: 3 },
        { type: 1, result: encodeRecord("RecordDiscardTile", { seat: 2, tile: "5m", moqie: true }) },
      ],
    });

    expect(parseMjsoulRecordBuffer(payload)).toMatchObject([
      {
        name: "RecordDiscardTile",
        data: { seat: 2, tile: "5m", moqie: true },
      },
    ]);
  });

  it("keeps action records when a v2 payload also has a short legacy prefix", () => {
    const firstRound = encodeRecord("RecordNewRound", { chang: 0, ju: 0, ben: 0, scores: [25000, 25000, 25000, 25000] });
    const payload = encodeGameDetailRecords({
      records: [firstRound],
      actions: [
        { type: 1, result: encodeRecord("RecordDiscardTile", { seat: 0, tile: "1m" }) },
        { type: 1, result: encodeRecord("RecordHule", { hules: [{ seat: 1, zimo: false, huTile: "1m", title: "荣和" }] }) },
        { type: 1, result: encodeRecord("RecordNewRound", { chang: 0, ju: 1, ben: 0, scores: [24000, 26000, 25000, 25000] }) },
        { type: 1, result: encodeRecord("RecordNoTile", {}) },
      ],
    });

    expect(parseMjsoulRecordBuffer(payload).map((record) => record.name)).toEqual([
      "RecordNewRound",
      "RecordDiscardTile",
      "RecordHule",
      "RecordNewRound",
      "RecordNoTile",
    ]);
  });
});

function encodeGameDetailRecords(data: Record<string, unknown>) {
  const detail = gameDetailRecordsType.encode(gameDetailRecordsType.create(data)).finish();
  return encodeWrapper(".lq.GameDetailRecords", detail);
}

function encodeRecord(name: string, data: Record<string, unknown>) {
  const type = root.lookupType(`.lq.${name}`);
  const encoded = type.encode(type.create(data)).finish();
  return encodeWrapper(`.lq.${name}`, encoded);
}

function encodeWrapper(name: string, data: Uint8Array) {
  return wrapperType.encode(wrapperType.create({ name, data })).finish();
}
