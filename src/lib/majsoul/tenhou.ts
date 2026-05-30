import { AnalyzeError, type PaipuSource, type RawMjsoulGame, type RawMjsoulRecord } from "./types";
import type { DebugCollector } from "./debug";

const TENHOU_LOG_ENDPOINTS = ["https://tenhou.net/0/log/", "https://tenhou.net/5/log/"];
const DRAW_SEATS: Record<string, 0 | 1 | 2 | 3> = { T: 0, U: 1, V: 2, W: 3 };
const DISCARD_SEATS: Record<string, 0 | 1 | 2 | 3> = { D: 0, E: 1, F: 2, G: 3 };
const WINDS = ["E", "S", "W", "N"] as const;

type XmlTag = {
  name: string;
  attrs: Record<string, string>;
  raw: string;
};

type TenhouState = {
  names: string[];
  finalScores?: number[];
  currentScores?: number[];
  pendingRiichi: boolean[];
  doraIndicators: string[];
};

export async function fetchTenhouGame(source: PaipuSource, debug?: DebugCollector): Promise<RawMjsoulGame> {
  const xml = await debugStage(debug, "fetch-record", () => fetchTenhouXml(source));
  return debugStage(debug, "parse-record", () => Promise.resolve(parseTenhouXml(source, xml)));
}

export function parseTenhouXml(source: PaipuSource, xml: string): RawMjsoulGame {
  const tags = parseXmlTags(xml);

  if (!tags.length || !tags.some((tag) => tag.name === "INIT")) {
    throw new AnalyzeError("PARSE_FAILED", "天凤牌谱中没有可读取的局数据。", 502);
  }

  const state: TenhouState = {
    names: ["东家", "南家", "西家", "北家"],
    pendingRiichi: [false, false, false, false],
    doraIndicators: [],
  };
  const records: RawMjsoulRecord[] = [];

  for (const tag of tags) {
    appendTenhouTag(source, tag, state, records);
  }

  const accounts = state.names.map((name, seat) => ({
    seat,
    nickname: name || WINDS[seat] || `P${seat + 1}`,
  }));
  const finalScores = state.finalScores ?? state.currentScores ?? [];

  return {
    head: {
      config: {
        mode: {
          mode: 1,
          detail_rule: {
            init_point: 25000,
          },
        },
      },
      accounts,
      result: {
        players: finalScores.map((score, seat) => ({
          seat,
          total_point: score,
        })),
      },
    },
    records,
  };
}

async function fetchTenhouXml(source: PaipuSource) {
  const urls = tenhouLogUrls(source);
  let lastError: unknown;

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const text = await response.text();

      if (response.ok && looksLikeTenhouXml(text)) {
        return text;
      }

      lastError = new AnalyzeError("FETCH_FAILED", `天凤牌谱读取失败：HTTP ${response.status}`, 502);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof AnalyzeError) {
    throw lastError;
  }

  throw new AnalyzeError("FETCH_FAILED", "天凤牌谱读取失败，请确认这是公开牌谱链接。", 502);
}

function tenhouLogUrls(source: PaipuSource) {
  const urls = new Set<string>();

  try {
    const parsed = new URL(source.url);
    if (parsed.hostname.toLowerCase().endsWith("tenhou.net") && parsed.pathname.includes("/log/")) {
      urls.add(parsed.toString());
    }
  } catch {
    // Raw log ids are handled by the canonical endpoints below.
  }

  for (const endpoint of TENHOU_LOG_ENDPOINTS) {
    urls.add(`${endpoint}?${encodeURIComponent(source.id)}`);
  }

  return [...urls];
}

function appendTenhouTag(source: PaipuSource, tag: XmlTag, state: TenhouState, records: RawMjsoulRecord[]) {
  if (tag.name === "UN") {
    state.names = [0, 1, 2, 3].map((seat) => readTenhouName(tag.attrs[`n${seat}`]) || state.names[seat] || `P${seat + 1}`);
    return;
  }

  if (tag.name === "INIT") {
    const seed = readNumberList(tag.attrs.seed);
    const scores = readNumberList(tag.attrs.ten).slice(0, 4).map((score) => score * 100);
    const roundIndex = seed[0] ?? 0;
    const dora = tenhouTileToLocal(seed[5]);
    state.currentScores = scores;
    state.pendingRiichi = [false, false, false, false];
    state.doraIndicators = dora ? [dora] : [];

    records.push({
      name: "RecordNewRound",
      data: {
        chang: Math.floor(roundIndex / 4),
        ju: roundIndex % 4,
        ben: seed[1] ?? 0,
        liqibang: seed[2] ?? 0,
        dora,
        doras: state.doraIndicators,
        scores,
        tiles0: readTenhouTiles(tag.attrs.hai0),
        tiles1: readTenhouTiles(tag.attrs.hai1),
        tiles2: readTenhouTiles(tag.attrs.hai2),
        tiles3: readTenhouTiles(tag.attrs.hai3),
      },
    });
    return;
  }

  const drawSeat = DRAW_SEATS[tag.name[0]?.toUpperCase() ?? ""];
  if (drawSeat !== undefined && /^\w\d+$/.test(tag.name)) {
    records.push({
      name: "RecordDealTile",
      data: {
        seat: drawSeat,
        tile: tenhouTileNameToLocal(tag.name),
        left_tile_count: undefined,
        doras: state.doraIndicators,
      },
    });
    return;
  }

  const discardSeat = DISCARD_SEATS[tag.name[0]?.toUpperCase() ?? ""];
  if (discardSeat !== undefined && /^\w\d+$/.test(tag.name)) {
    const seat = discardSeat;
    records.push({
      name: "RecordDiscardTile",
      data: {
        seat,
        tile: tenhouTileNameToLocal(tag.name),
        moqie: tag.name[0] === tag.name[0]?.toLowerCase(),
        is_liqi: state.pendingRiichi[seat],
      },
    });
    state.pendingRiichi[seat] = false;
    return;
  }

  if (tag.name === "REACH" && tag.attrs.step === "1") {
    const seat = readSeat(tag.attrs.who);
    state.pendingRiichi[seat] = true;
    return;
  }

  if (tag.name === "DORA") {
    const dora = tenhouTileToLocal(Number(tag.attrs.hai));
    if (dora) {
      state.doraIndicators = [...state.doraIndicators, dora];
    }
    return;
  }

  if (tag.name === "N") {
    records.push(decodeTenhouMeld(tag.attrs));
    return;
  }

  if (tag.name === "AGARI") {
    const scores = parseTenhouScoreChange(tag.attrs.sc, state.currentScores);
    if (scores.endScores.length) {
      state.currentScores = scores.endScores;
      state.finalScores = scores.endScores;
    }

    records.push({
      name: "RecordHule",
      data: {
        scores: scores.endScores,
        delta_scores: scores.deltaScores,
        hules: [
          {
            seat: readSeat(tag.attrs.who),
            zimo: tag.attrs.who === tag.attrs.fromWho,
            hu_tile: tenhouTileToLocal(Number(tag.attrs.machi)),
            title: formatAgariTitle(tag.attrs),
            point_sum: readNumberList(tag.attrs.ten)[1] ?? 0,
          },
        ],
      },
    });
    readFinalScores(tag, state);
    return;
  }

  if (tag.name === "RYUUKYOKU") {
    const scores = parseTenhouScoreChange(tag.attrs.sc, state.currentScores);
    if (scores.endScores.length) {
      state.currentScores = scores.endScores;
      state.finalScores = scores.endScores;
    }

    records.push({
      name: "RecordNoTile",
      data: {
        players: [0, 1, 2, 3].map((seat) => ({ tingpai: Boolean(tag.attrs[`hai${seat}`]) })),
        scores: [
          {
            scores: scores.endScores,
            delta_scores: scores.deltaScores,
          },
        ],
      },
    });
    readFinalScores(tag, state);
    return;
  }

  if (tag.name === "OWARI") {
    const values = readNumberList(tag.attrs.owari);
    if (values.length >= 8) {
      state.finalScores = [0, 1, 2, 3].map((seat) => values[seat * 2] * 100);
    }
  }

  void source;
}

function decodeTenhouMeld(attrs: Record<string, string>): RawMjsoulRecord {
  const who = readSeat(attrs.who);
  const m = Number(attrs.m);

  if (!Number.isFinite(m)) {
    throw new AnalyzeError("PARSE_FAILED", "天凤副露数据缺少 m 编码。", 502);
  }

  const from = (who + (m & 3)) % 4;

  if (m & 0x0004) {
    const meld = decodeChi(m, who, from);
    return {
      name: "RecordChiPengGang",
      data: { seat: who, type: 0, tiles: meld.tiles, froms: meld.froms },
    };
  }

  if (m & 0x0008) {
    const meld = decodePon(m, who, from);
    return {
      name: "RecordChiPengGang",
      data: { seat: who, type: 1, tiles: meld.tiles, froms: meld.froms },
    };
  }

  if (m & 0x0010) {
    return {
      name: "RecordAnGangAddGang",
      data: { seat: who, type: 2, tiles: tenhouTileToLocal(decodePonBaseTile(m)) },
    };
  }

  const tile = tenhouTileToLocal(((m >> 8) & 0xff) || Number(attrs.hai0));
  return {
    name: "RecordAnGangAddGang",
    data: { seat: who, type: from === who ? 3 : 0, tiles: tile },
  };
}

function decodeChi(m: number, who: number, from: number) {
  const encoded = (m >> 10) & 0x3f;
  const calledIndex = encoded % 3;
  const base = Math.floor(encoded / 3);
  const baseTile = Math.floor(base / 7) * 9 + (base % 7);
  const tileIds = [
    baseTile * 4 + ((m >> 3) & 3),
    (baseTile + 1) * 4 + ((m >> 5) & 3),
    (baseTile + 2) * 4 + ((m >> 7) & 3),
  ];

  return {
    tiles: tileIds.map(tenhouTileToLocal),
    froms: tileIds.map((_, index) => (index === calledIndex ? from : who)),
  };
}

function decodePon(m: number, who: number, from: number) {
  const unused = (m >> 5) & 3;
  const encoded = (m >> 9) & 0x7f;
  const calledIndex = encoded % 3;
  const base = Math.floor(encoded / 3) * 4;
  const tileIds = [0, 1, 2, 3].filter((index) => index !== unused).map((index) => base + index);

  return {
    tiles: tileIds.map(tenhouTileToLocal),
    froms: tileIds.map((_, index) => (index === calledIndex ? from : who)),
  };
}

function decodePonBaseTile(m: number) {
  const encoded = (m >> 9) & 0x7f;
  return Math.floor(encoded / 3) * 4;
}

function parseTenhouScoreChange(value: string | undefined, currentScores: number[] | undefined) {
  const values = readNumberList(value);

  if (values.length < 8) {
    return { endScores: currentScores ?? [], deltaScores: [0, 0, 0, 0] };
  }

  const startScores = [0, 1, 2, 3].map((seat) => values[seat * 2] * 100);
  const deltaScores = [0, 1, 2, 3].map((seat) => values[seat * 2 + 1] * 100);

  return {
    endScores: startScores.map((score, seat) => score + deltaScores[seat]),
    deltaScores,
  };
}

function readFinalScores(tag: XmlTag, state: TenhouState) {
  const values = readNumberList(tag.attrs.owari);
  if (values.length >= 8) {
    state.finalScores = [0, 1, 2, 3].map((seat) => values[seat * 2] * 100);
  }
}

function readTenhouTiles(value: string | undefined) {
  return readNumberList(value).map(tenhouTileToLocal);
}

function tenhouTileNameToLocal(name: string) {
  return tenhouTileToLocal(Number(name.slice(1)));
}

function tenhouTileToLocal(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const tile = Number(value);

  if (tile < 0 || tile > 135) {
    throw new AnalyzeError("PARSE_FAILED", `无法识别天凤牌编号 ${tile}。`, 502);
  }

  if (tile < 36) {
    return formatSuitTile(tile, "m", 16);
  }

  if (tile < 72) {
    return formatSuitTile(tile - 36, "p", 52);
  }

  if (tile < 108) {
    return formatSuitTile(tile - 72, "s", 88);
  }

  return `${Math.floor((tile - 108) / 4) + 1}z`;
}

function formatSuitTile(offset: number, suit: "m" | "p" | "s", redTileId: number) {
  const rank = Math.floor(offset / 4) + 1;
  const absoluteTileId = suit === "m" ? offset : suit === "p" ? offset + 36 : offset + 72;

  return absoluteTileId === redTileId ? `0${suit}` : `${rank}${suit}`;
}

function parseXmlTags(xml: string): XmlTag[] {
  const tags: XmlTag[] = [];
  const tagPattern = /<([A-Za-z][A-Za-z0-9]*)([^<>]*)\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(xml))) {
    tags.push({
      name: match[1],
      attrs: parseAttrs(match[2] ?? ""),
      raw: match[0],
    });
  }

  return tags;
}

function parseAttrs(value: string) {
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z0-9_]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(value))) {
    attrs[match[1]] = decodeXmlValue(match[2]);
  }

  return attrs;
}

function decodeXmlValue(value: string) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function readTenhouName(value: string | undefined) {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readNumberList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map(Number)
    .filter(Number.isFinite);
}

function readSeat(value: string | undefined): 0 | 1 | 2 | 3 {
  const seat = Number(value);
  return seat === 0 || seat === 1 || seat === 2 || seat === 3 ? seat : 0;
}

function formatAgariTitle(attrs: Record<string, string>) {
  if (attrs.yakuman) {
    return "役满";
  }

  const ten = readNumberList(attrs.ten);
  const fu = ten[0];
  const point = ten[1];

  return fu && point ? `${fu}符 ${point}点` : "和了";
}

function looksLikeTenhouXml(text: string) {
  return text.includes("<mjloggm") || text.includes("<INIT");
}

async function debugStage<T>(debug: DebugCollector | undefined, name: "fetch-record" | "parse-record", fn: () => Promise<T>) {
  return debug ? debug.stage(name, fn) : fn();
}
