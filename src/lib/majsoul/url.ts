import { AnalyzeError, type MjsoulRegion, type PaipuSource } from "./types";

const LOG_ID_PATTERN = /^\d{6}-[0-9a-f-]{36}(?:_a\d+)?$/i;
const HOST_REGION: Array<[string, MjsoulRegion]> = [
  ["maj-soul.com", "cn"],
  ["majsoul.game.yo-star.com", "en"],
  ["mahjongsoul.game.yo-star.com", "en"],
  ["mahjongsoul.com", "jp"],
];

export function parsePaipuSource(input: string, explicitTargetSeat?: number): PaipuSource {
  const value = input.trim();

  if (!value) {
    throw new AnalyzeError("BAD_REQUEST", "请先粘贴雀魂牌谱 URL。");
  }

  const parsedTargetSeat = parseTargetSeat(explicitTargetSeat);
  const raw = parseAsUrl(value, parsedTargetSeat) ?? parseAsRawId(value, parsedTargetSeat);

  if (!raw) {
    throw new AnalyzeError("BAD_REQUEST", "无法识别这个牌谱链接，请确认 URL 中包含 paipu 参数。");
  }

  return raw;
}

function parseAsUrl(value: string, targetSeat?: 0 | 1 | 2 | 3): PaipuSource | null {
  try {
    const url = new URL(value);
    const paipu = url.searchParams.get("paipu") ?? "";
    const id = normalizePaipuId(paipu);

    if (!id) {
      return null;
    }

    return {
      id,
      url: value,
      region: detectRegion(url.hostname),
      targetSeat: targetSeat ?? parseTargetSeat(url.searchParams.get("tw")),
    };
  } catch {
    return null;
  }
}

function parseAsRawId(value: string, targetSeat?: 0 | 1 | 2 | 3): PaipuSource | null {
  const id = normalizePaipuId(value);

  if (!id) {
    return null;
  }

  return {
    id,
    url: value,
    region: "cn",
    targetSeat,
  };
}

function normalizePaipuId(value: string) {
  const trimmed = value.trim();

  if (!LOG_ID_PATTERN.test(trimmed)) {
    return "";
  }

  return trimmed.split("_")[0];
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

function detectRegion(hostname: string): MjsoulRegion {
  const host = hostname.toLowerCase();
  const match = HOST_REGION.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match?.[1] ?? "cn";
}
