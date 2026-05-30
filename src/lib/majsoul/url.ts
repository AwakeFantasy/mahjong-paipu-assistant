import { AnalyzeError, type MahjongSoulRegion, type PaipuSource } from "./types";

const MAJSOUL_LOG_ID_PATTERN = /^\d{6}-[0-9a-f-]{36}(?:_a\d+)?$/i;
const TENHOU_LOG_ID_PATTERN = /^\d{10}gm-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]+$/i;
const RIICHI_CITY_LOG_ID_PATTERN = /^[a-z0-9]{20}$/i;
const HOST_REGION: Array<[string, MahjongSoulRegion]> = [
  ["maj-soul.com", "cn"],
  ["majsoul.game.yo-star.com", "en"],
  ["mahjongsoul.game.yo-star.com", "en"],
  ["mahjongsoul.com", "jp"],
];

export function parsePaipuSource(input: string, explicitTargetSeat?: number): PaipuSource {
  const value = input.trim();

  if (!value) {
    throw new AnalyzeError("BAD_REQUEST", "请先粘贴雀魂或天凤牌谱 URL。");
  }

  const parsedTargetSeat = parseTargetSeat(explicitTargetSeat);
  const raw = parseAsUrl(value, parsedTargetSeat) ?? parseAsRawId(value, parsedTargetSeat);

  if (!raw) {
    throw new AnalyzeError("BAD_REQUEST", "无法识别这个牌谱链接，请确认 URL 中包含 paipu 或 log 参数。");
  }

  return raw;
}

function parseAsUrl(value: string, targetSeat?: 0 | 1 | 2 | 3): PaipuSource | null {
  try {
    const url = new URL(value);
    const tenhouId = parseTenhouLogId(url);

    if (tenhouId) {
      return {
        id: tenhouId,
        url: value,
        region: "tenhou",
        provider: "tenhou",
        targetSeat: targetSeat ?? parseTargetSeat(url.searchParams.get("tw")),
      };
    }

    const riichiCity = parseRiichiCityLogId(url);

    if (riichiCity) {
      return {
        id: riichiCity.id,
        url: value,
        region: "riichi-city",
        provider: "riichi-city",
        targetSeat: targetSeat ?? riichiCity.targetSeat ?? parseTargetSeat(url.searchParams.get("tw")),
      };
    }

    const paipu = url.searchParams.get("paipu") ?? "";
    const id = normalizeMjsoulPaipuId(paipu);

    if (!id) {
      return null;
    }

    return {
      id,
      url: value,
      region: detectRegion(url.hostname),
      provider: "majsoul",
      targetSeat: targetSeat ?? parseTargetSeat(url.searchParams.get("tw")),
    };
  } catch {
    return null;
  }
}

function parseAsRawId(value: string, targetSeat?: 0 | 1 | 2 | 3): PaipuSource | null {
  const riichiCity = parseRiichiCityRawId(value);

  if (riichiCity) {
    return {
      id: riichiCity.id,
      url: value,
      region: "riichi-city",
      provider: "riichi-city",
      targetSeat: targetSeat ?? riichiCity.targetSeat,
    };
  }

  const tenhouId = normalizeTenhouLogId(value);

  if (tenhouId) {
    return {
      id: tenhouId,
      url: value,
      region: "tenhou",
      provider: "tenhou",
      targetSeat,
    };
  }

  const id = normalizeMjsoulPaipuId(value);

  if (!id) {
    return null;
  }

  return {
    id,
    url: value,
    region: "cn",
    provider: "majsoul",
    targetSeat,
  };
}

function normalizeMjsoulPaipuId(value: string) {
  const trimmed = value.trim();

  if (!MAJSOUL_LOG_ID_PATTERN.test(trimmed)) {
    return "";
  }

  return trimmed.split("_")[0];
}

function parseTenhouLogId(url: URL) {
  if (!isTenhouHost(url.hostname)) {
    return "";
  }

  const logParam = url.searchParams.get("log");
  const directQuery = url.search ? decodeURIComponent(url.search.slice(1).split("&")[0] ?? "") : "";
  const pathTail = url.pathname.split("/").filter(Boolean).at(-1) ?? "";

  return normalizeTenhouLogId(logParam ?? "") || normalizeTenhouLogId(directQuery) || normalizeTenhouLogId(pathTail);
}

function normalizeTenhouLogId(value: string) {
  const trimmed = value.trim();

  return TENHOU_LOG_ID_PATTERN.test(trimmed) ? trimmed : "";
}

function parseRiichiCityLogId(url: URL) {
  if (!isRiichiCityHost(url.hostname)) {
    return null;
  }

  const rawId = url.searchParams.get("log_id") ?? url.searchParams.get("log") ?? url.searchParams.get("id") ?? url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const id = normalizeRiichiCityLogId(rawId);

  return id ? { id, targetSeat: parseTargetSeat(url.searchParams.get("seat") ?? url.searchParams.get("tw")) } : null;
}

function parseRiichiCityRawId(value: string) {
  const [rawId, rawSeat] = value.trim().split("@", 2);
  const id = normalizeRiichiCityLogId(rawId ?? "");

  return id ? { id, targetSeat: parseTargetSeat(rawSeat) } : null;
}

function normalizeRiichiCityLogId(value: string) {
  const trimmed = value.trim();

  return RIICHI_CITY_LOG_ID_PATTERN.test(trimmed) ? trimmed : "";
}

function parseTargetSeat(value?: number | string | null): 0 | 1 | 2 | 3 | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const seat = Number(value);

  if (seat === 0 || seat === 1 || seat === 2 || seat === 3) {
    return seat;
  }

  throw new AnalyzeError("BAD_REQUEST", "目标玩家只能是 0、1、2、3。");
}

function detectRegion(hostname: string): MahjongSoulRegion {
  const host = hostname.toLowerCase();
  const match = HOST_REGION.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match?.[1] ?? "cn";
}

function isTenhouHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "tenhou.net" || host.endsWith(".tenhou.net");
}

function isRiichiCityHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "rc.honk.li" || host.endsWith(".riichi.city") || host.includes("mahjong-jp");
}
