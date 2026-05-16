import type { Player, RoundEvent } from "@/lib/majsoul/types";
import { formatTileName, formatTileNames } from "../../lib/majsoul/tile-format";

export const seatWindNames = ["东家", "南家", "西家", "北家"] as const;

export function formatRoundEvent(event: RoundEvent, players: Player[]) {
  if (event.type === "new-round") {
    return event.label;
  }

  if (event.type === "draw") {
    return `${seatName(event.seat, players)} 摸 ${formatTileName(event.tile)}`;
  }

  if (event.type === "discard") {
    return `${seatName(event.seat, players)} 切 ${formatTileName(event.tile)}${event.moqie ? "（摸切）" : ""}${event.riichi ? "，立直" : ""}`;
  }

  if (event.type === "call") {
    return `${seatName(event.seat, players)} ${event.callType} ${formatTileNames(event.tiles)}`;
  }

  if (event.type === "kan") {
    return `${seatName(event.seat, players)} ${event.callType} ${formatTileNames(event.tiles)}`;
  }

  if (event.type === "agari") {
    return `${seatName(event.seat, players)} ${event.zimo ? "自摸" : "荣和"} ${event.title} ${event.point || ""}`.trim();
  }

  return event.label;
}

export function eventSeatLabel(event: RoundEvent, players: Player[]) {
  if ("seat" in event) {
    return seatName(event.seat, players);
  }

  return "结算";
}

export function eventTypeLabel(event?: RoundEvent) {
  if (!event) {
    return "起手";
  }

  const labels: Record<RoundEvent["type"], string> = {
    "new-round": "开局",
    draw: "摸牌",
    discard: "切牌",
    call: "副露",
    kan: "杠",
    agari: "和了",
    ryukyoku: "流局",
  };

  return labels[event.type];
}

export function eventProgressLabel(cursor: number, maxCursor: number) {
  const safeMaxCursor = normalizeCursor(maxCursor, Number.MAX_SAFE_INTEGER);
  const safeCursor = normalizeCursor(cursor, safeMaxCursor);

  if (safeMaxCursor <= 0) {
    return "无事件";
  }

  if (safeCursor <= 0) {
    return "起手状态";
  }

  return `${safeCursor} / ${safeMaxCursor}`;
}

export function seatName(seat: number, players: Player[]) {
  const player = players[seat];
  return player ? `${seatWindNames[seat] ?? seat} ${player.name}` : String(seatWindNames[seat] ?? seat);
}

function normalizeCursor(cursor: number, maxCursor: number) {
  if (!Number.isFinite(cursor)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(cursor), maxCursor));
}
