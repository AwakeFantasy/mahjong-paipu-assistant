import protobuf from "protobufjs";
import liqiSchema from "mjsoul/liqi.json";

import { AnalyzeError, type RawMjsoulRecord } from "./types";

const root = protobuf.Root.fromJSON(liqiSchema as protobuf.INamespace);
const wrapperType = root.lookupType("Wrapper");
const gameDetailRecordsType = root.lookupType("GameDetailRecords");

type DecodedWrapper = {
  name?: string;
  data?: Uint8Array;
};

type DecodedGameDetailRecords = {
  records?: Uint8Array[];
  actions?: Array<{
    type?: number;
    result?: Uint8Array;
  }>;
};

export function parseMjsoulRecordBuffer(data: Uint8Array | Buffer): RawMjsoulRecord[] {
  try {
    const detail = decodeGameDetailRecords(data);
    const oldRecords = parseWrappedRecords(detail.records ?? []);
    const actionRecords = parseActionRecords(detail.actions ?? []);

    return mergeParsedRecords(oldRecords, actionRecords);
  } catch {
    throw new AnalyzeError("PARSE_FAILED", "雀魂牌谱数据解析失败。", 502);
  }
}

function mergeParsedRecords(oldRecords: RawMjsoulRecord[], actionRecords: RawMjsoulRecord[]) {
  if (!oldRecords.length) {
    return actionRecords;
  }

  if (!actionRecords.length) {
    return oldRecords;
  }

  if (actionRecords.length > oldRecords.length && startsWithSameRecord(actionRecords, oldRecords[0])) {
    return actionRecords;
  }

  if (actionRecords.length > oldRecords.length) {
    return [...oldRecords, ...actionRecords];
  }

  return oldRecords;
}

function startsWithSameRecord(records: RawMjsoulRecord[], firstRecord: RawMjsoulRecord | undefined) {
  return Boolean(firstRecord && records[0]?.name === firstRecord.name && JSON.stringify(records[0]?.data) === JSON.stringify(firstRecord.data));
}

function decodeGameDetailRecords(data: Uint8Array | Buffer): DecodedGameDetailRecords {
  const outer = wrapperType.decode(data) as DecodedWrapper;

  if (!outer.data) {
    throw new Error("GameDetailRecords wrapper is missing data.");
  }

  return gameDetailRecordsType.decode(outer.data) as DecodedGameDetailRecords;
}

function parseWrappedRecords(records: Uint8Array[]) {
  return records.map(parseWrappedRecord).filter((record): record is RawMjsoulRecord => Boolean(record));
}

function parseActionRecords(actions: NonNullable<DecodedGameDetailRecords["actions"]>) {
  return actions
    .filter((action) => action.type === 1 && action.result && action.result.length > 0)
    .map((action) => parseWrappedRecord(action.result))
    .filter((record): record is RawMjsoulRecord => Boolean(record));
}

function parseWrappedRecord(data: Uint8Array | undefined): RawMjsoulRecord | undefined {
  if (!data) {
    return undefined;
  }

  const wrapper = wrapperType.decode(data) as DecodedWrapper;
  const messageName = wrapper.name;

  if (!messageName || !wrapper.data) {
    return undefined;
  }

  const messageType = root.lookupType(messageName);
  const decoded = messageType.decode(wrapper.data);
  return {
    name: messageName.replace(/^\.lq\./, ""),
    data: messageType.toObject(decoded, {
      defaults: false,
      enums: String,
      longs: Number,
    }) as Record<string, unknown>,
  };
}
