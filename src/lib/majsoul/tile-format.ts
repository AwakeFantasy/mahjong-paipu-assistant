const suitNames: Record<string, string> = {
  m: "万",
  p: "筒",
  s: "索",
};

const honorNames: Record<string, string> = {
  "1z": "东",
  "2z": "南",
  "3z": "西",
  "4z": "北",
  "5z": "白",
  "6z": "发财",
  "7z": "红中",
};

const tilePattern = /^([0-9])([mpsz])$/;

export function formatTileName(value: string | undefined | null) {
  if (!value) {
    return "";
  }

  const normalized = normalizeTileCode(value);
  const honorName = honorNames[normalized];
  if (honorName) {
    return honorName;
  }

  const match = normalized.match(tilePattern);
  if (!match) {
    return value;
  }

  const [, rawRank, suit] = match;
  const suitName = suitNames[suit];
  if (!suitName) {
    return value;
  }

  if (rawRank === "0") {
    return `红5${suitName}`;
  }

  return `${rawRank}${suitName}`;
}

export function formatTileNames(values: string[]) {
  return values.map(formatTileName).join(" ");
}

function normalizeTileCode(value: string) {
  const trimmed = value.trim();
  const redFive = trimmed.match(/^5([mps])r$/i);
  if (redFive) {
    return `0${redFive[1].toLowerCase()}`;
  }

  return trimmed.toLowerCase();
}
