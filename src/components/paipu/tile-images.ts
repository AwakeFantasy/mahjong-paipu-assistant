export const TILE_IMAGE_WIDTH = 48;
export const TILE_IMAGE_HEIGHT = 64;
export const TILE_IMAGE_BASE_PATH = "/mahjong-tiles";

export const LOCAL_TILE_IMAGE_CODES = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "0m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "0p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "0s",
  "1z",
  "2z",
  "3z",
  "4z",
  "5z",
  "6z",
  "7z",
] as const;

export type LocalTileImageCode = (typeof LOCAL_TILE_IMAGE_CODES)[number];

export const LOCAL_TILE_IMAGE_PATHS: Record<LocalTileImageCode, string> =
  Object.fromEntries(
    LOCAL_TILE_IMAGE_CODES.map((code) => [
      code,
      `${TILE_IMAGE_BASE_PATH}/${code}.svg`,
    ]),
  ) as Record<LocalTileImageCode, string>;

const MJAI_HONOR_TO_LOCAL_TILE: Record<string, LocalTileImageCode> = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
  P: "5z",
  F: "6z",
  C: "7z",
};

const TENHOU_SUIT_TO_LOCAL_SUIT: Record<string, "m" | "p" | "s" | "z"> = {
  "1": "m",
  "2": "p",
  "3": "s",
  "4": "z",
};

export function getLocalTileImagePath(tileCode: string): string | undefined {
  const normalized = normalizeTileImageCode(tileCode);
  return normalized ? LOCAL_TILE_IMAGE_PATHS[normalized] : undefined;
}

export function normalizeTileImageCode(tileCode: string | undefined | null): LocalTileImageCode | undefined {
  if (!tileCode) {
    return undefined;
  }

  const trimmed = tileCode.trim();

  if (!trimmed) {
    return undefined;
  }

  if (isLocalTileImageCode(trimmed)) {
    return trimmed;
  }

  const upper = trimmed.toUpperCase();
  const mjaiHonor = MJAI_HONOR_TO_LOCAL_TILE[upper];

  if (mjaiHonor) {
    return mjaiHonor;
  }

  const lower = trimmed.toLowerCase();

  if (isLocalTileImageCode(lower)) {
    return lower;
  }

  const mjaiRedFive = /^5([mps])r$/.exec(lower);
  if (mjaiRedFive) {
    return `0${mjaiRedFive[1]}` as LocalTileImageCode;
  }

  const tenhouCode = /^([1-4])([0-9])$/.exec(trimmed);
  if (tenhouCode) {
    const suit = TENHOU_SUIT_TO_LOCAL_SUIT[tenhouCode[1]];
    const rank = tenhouCode[2];
    const normalized = `${rank}${suit}`;
    return isLocalTileImageCode(normalized) ? normalized : undefined;
  }

  return undefined;
}

export function isLocalTileImageCode(tileCode: string): tileCode is LocalTileImageCode {
  return Object.hasOwn(LOCAL_TILE_IMAGE_PATHS, tileCode);
}
