import type { KeyboardEvent } from "react";
import Image from "next/image";

import { getLocalTileImagePath, normalizeTileImageCode, TILE_IMAGE_HEIGHT, TILE_IMAGE_WIDTH } from "@/components/paipu/tile-images";
import type { PlaybackCall, PlaybackSeat } from "@/lib/majsoul/playback";
import { formatTileName } from "../../lib/majsoul/tile-format";

export type TileSize = "normal" | "compact";

export type TileProps = {
  value: string;
  size?: TileSize;
  current?: boolean;
  drawn?: boolean;
  riichi?: boolean;
  source?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  selected?: boolean;
  recommendationBadge?: string;
  recommendationBadgeTone?: "gold" | "green";
  actualBadge?: string;
  recommended?: boolean;
  flat?: boolean;
  onHoverTile?: (value: string | null) => void;
  onToggleTile?: (value: string) => void;
  className?: string;
};

export type TileRiverProps = {
  tiles: string[];
  riichiIndexes?: number[];
  currentIndex?: number;
  drawnIndexes?: number[];
  highlightedTile?: string | null;
  selectedTile?: string | null;
  onHoverTile?: (value: string | null) => void;
  onToggleTile?: (value: string) => void;
  emptyLabel?: string;
  maxVisible?: number;
  className?: string;
  tileClassName?: string;
  flatTiles?: boolean;
};

export type SeatDiscardsProps = TileRiverProps & {
  seat: PlaybackSeat;
  label?: string;
};

export type CallMeldProps = {
  call: PlaybackCall;
  compact?: boolean;
  highlightedTile?: string | null;
  selectedTile?: string | null;
  onHoverTile?: (value: string | null) => void;
  onToggleTile?: (value: string) => void;
  className?: string;
  tileClassName?: string;
};

const suitStyles: Record<string, string> = {
  m: "text-rose-700 border-rose-200 bg-rose-50/95",
  p: "text-blue-700 border-blue-200 bg-sky-50/95",
  s: "text-emerald-700 border-emerald-200 bg-emerald-50/95",
  z: "text-zinc-900 border-amber-200 bg-amber-50/95",
};

const honorLabels: Record<string, string> = {
  "1z": "东",
  "2z": "南",
  "3z": "西",
  "4z": "北",
  "5z": "白",
  "6z": "发",
  "7z": "中",
};

const suitLabels: Record<string, string> = {
  m: "万",
  p: "筒",
  s: "索",
  z: "字",
};

const callLabels: Record<string, string> = {
  chi: "吃",
  peng: "碰",
  pon: "碰",
  daiminkan: "明杠",
  ankan: "暗杠",
  kakan: "加杠",
  minggang: "明杠",
  gang: "杠",
  kan: "杠",
  "吃": "吃",
  "碰": "碰",
  "明杠": "明杠",
  "暗杠": "暗杠",
  "加杠": "加杠",
  "杠": "杠",
};

export function Tile({
  value,
  size = "normal",
  current = false,
  drawn = false,
  riichi = false,
  source = false,
  dimmed = false,
  highlighted = false,
  selected = false,
  recommendationBadge,
  recommendationBadgeTone = "green",
  actualBadge,
  recommended = false,
  flat = false,
  onHoverTile,
  onToggleTile,
  className,
}: TileProps) {
  const normalizedValue = normalizeTileImageCode(value) ?? value;
  const tile = parseTile(normalizedValue);
  const isCompact = size === "compact";
  const imagePath = getLocalTileImagePath(normalizedValue);
  const interactive = Boolean(onHoverTile || onToggleTile);
  const handleKeyDown = interactive ? createTileKeyHandler(value, onToggleTile) : undefined;

  return (
    <span
      className={cx(
        "relative isolate grid shrink-0 place-items-center rounded border font-semibold",
        "transition-transform duration-150",
        isCompact ? "h-9 w-7 text-[12px]" : "h-12 w-9 text-base",
        imagePath ? "border-zinc-200 bg-white" : (suitStyles[tile.suit] ?? suitStyles.z),
        tile.red ? "border-red-400 text-red-700" : "",
        current ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-transparent" : "",
        source ? "ring-2 ring-cyan-300 ring-offset-1 ring-offset-transparent" : "",
        highlighted ? "scale-105 brightness-110 shadow-[0_0_0_3px_rgba(190,242,100,0.75)]" : "",
        selected ? "outline outline-2 outline-lime-200 outline-offset-2" : "",
        flat ? "shadow-none" : "shadow-sm",
        recommended ? (recommendationBadgeTone === "gold" ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-transparent" : "ring-2 ring-lime-300 ring-offset-1 ring-offset-transparent") : "",
        drawn ? "translate-y-[-2px] border-amber-300 bg-amber-50" : "",
        riichi ? "-rotate-6 border-amber-500 bg-amber-100" : "",
        dimmed ? "opacity-60" : "",
        className,
      )}
      title={formatTileName(normalizedValue)}
      aria-label={`${formatTileName(normalizedValue)}${highlighted ? " highlighted with matching tiles" : ""}`}
      aria-pressed={interactive ? selected || highlighted : undefined}
      data-paipu-tile="true"
      data-paipu-tile-value={value}
      data-paipu-tile-highlighted={highlighted ? "true" : "false"}
      data-paipu-tile-selected={selected ? "true" : "false"}
      data-paipu-tile-interactive={interactive ? "true" : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onMouseEnter={onHoverTile ? () => onHoverTile(value) : undefined}
      onMouseLeave={onHoverTile ? () => onHoverTile(null) : undefined}
      onClick={
        onToggleTile
          ? (event) => {
              event.stopPropagation();
              onToggleTile(value);
            }
          : undefined
      }
      onKeyDown={handleKeyDown}
    >
      {imagePath ? (
        <Image
          src={imagePath}
          alt={formatTileName(normalizedValue)}
          width={TILE_IMAGE_WIDTH}
          height={TILE_IMAGE_HEIGHT}
          className="h-full w-full rounded-[3px] object-contain"
          draggable={false}
          unoptimized
        />
      ) : (
        <>
          <span className="leading-none">{tile.face}</span>
          {!isCompact && tile.subLabel ? (
            <span className="mt-0.5 text-[9px] font-medium leading-none opacity-70">{tile.subLabel}</span>
          ) : null}
        </>
      )}
      {tile.red ? <span className="absolute right-0.5 top-0.5 rounded-sm bg-red-500 px-0.5 text-[8px] leading-3 text-white" aria-hidden="true">赤</span> : null}
      {riichi ? <span className="absolute -right-1 -top-1 rounded-sm bg-amber-500 px-0.5 text-[8px] leading-3 text-white" aria-hidden="true">立</span> : null}
      {drawn ? <span className="absolute left-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" /> : null}
      {source ? <span className="absolute inset-y-1 right-0 w-0.5 rounded-full bg-cyan-400" aria-hidden="true" /> : null}
      {current ? <span className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full bg-amber-400" aria-hidden="true" /> : null}
      {recommendationBadge ? (
        <span
          className={cx(
            "pointer-events-none absolute -top-3 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border bg-zinc-950 px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm",
            recommendationBadgeTone === "gold" ? "border-amber-300/70 text-amber-300" : "border-lime-200/70 text-lime-200",
          )}
        >
          {recommendationBadge}
          {actualBadge ? (
            <span className="absolute -right-2 -top-2 rounded-full border border-rose-200 bg-rose-600 px-1 py-0.5 text-[8px] font-extrabold leading-none text-white shadow-sm">
              {actualBadge}
            </span>
          ) : null}
        </span>
      ) : actualBadge ? (
        <span className="pointer-events-none absolute -top-3 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-rose-200 bg-rose-600 px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-white shadow-sm">
          {actualBadge}
        </span>
      ) : null}
    </span>
  );
}

export function TileBack({ size = "compact", className }: { size?: TileSize; className?: string }) {
  const isCompact = size === "compact";

  return (
    <span
      className={cx(
        "relative grid shrink-0 place-items-center overflow-hidden rounded border border-emerald-950/30 bg-emerald-900 shadow-sm",
        isCompact ? "h-9 w-7" : "h-12 w-9",
        className,
      )}
      aria-hidden="true"
      data-paipu-tile-back="true"
    >
      <Image
        src="/mahjong-tiles/back.svg"
        alt=""
        width={TILE_IMAGE_WIDTH}
        height={TILE_IMAGE_HEIGHT}
        className="h-full w-full object-contain"
        draggable={false}
        unoptimized
      />
    </span>
  );
}

export function TileRiver({
  tiles,
  riichiIndexes = [],
  currentIndex,
  drawnIndexes = [],
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
  emptyLabel = "No discards",
  maxVisible,
  className,
  tileClassName,
  flatTiles = false,
}: TileRiverProps) {
  const needsScroll = typeof maxVisible === "number" && tiles.length > maxVisible;

  return (
    <div
      className={cx(
        "relative flex max-h-28 min-h-14 flex-wrap content-start gap-1 overflow-y-auto overflow-x-hidden rounded-md border border-white/10 bg-black/10 p-1.5",
        className,
      )}
      aria-label={needsScroll ? `${tiles.length} discards, scroll for earlier tiles` : undefined}
    >
      {tiles.map((tile, index) => (
        <Tile
          key={`${tile}-${index}`}
          value={tile}
          size="compact"
          current={index === currentIndex}
          drawn={drawnIndexes.includes(index)}
          riichi={riichiIndexes.includes(index)}
          highlighted={tile === highlightedTile}
          selected={tile === selectedTile}
          flat={flatTiles}
          onHoverTile={onHoverTile}
          onToggleTile={onToggleTile}
          className={tileClassName}
        />
      ))}
      {!tiles.length ? <span className="px-1 py-1 text-xs text-white/45">{emptyLabel}</span> : null}
      {needsScroll ? (
        <span className="sticky bottom-0 ml-auto self-end rounded border border-white/10 bg-zinc-950/70 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
          共{tiles.length}
        </span>
      ) : null}
    </div>
  );
}

export function SeatDiscards({ seat, label, ...riverProps }: SeatDiscardsProps) {
  return (
    <div className="min-w-0">
      {label ? (
        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-white/65">
          <span>{label}</span>
          <span className="tabular-nums">seat {seat}</span>
        </div>
      ) : null}
      <TileRiver {...riverProps} />
    </div>
  );
}

export function CallMeld({
  call,
  compact = false,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
  className,
  tileClassName,
}: CallMeldProps) {
  const label = callLabels[call.callType.toLowerCase()] ?? call.callType;
  const source = formatCallSource(call.froms, call.seat);

  return (
    <div
      className={cx(
        "min-w-0 rounded-md border border-white/20 bg-white/10 px-2 py-2 text-xs text-white/85",
        compact ? "space-y-1" : "space-y-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        {source ? <span className="text-[11px] text-white/55">{source}</span> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {call.tiles.map((tile, index) => (
          <Tile
            key={`${call.eventIndex}-${tile}-${index}`}
            value={tile}
            size="compact"
            source={isSourceTile(call, index)}
            highlighted={tile === highlightedTile}
            selected={tile === selectedTile}
            onHoverTile={onHoverTile}
            onToggleTile={onToggleTile}
            className={tileClassName}
          />
        ))}
      </div>
    </div>
  );
}

function parseTile(value: string) {
  const suit = value.slice(-1);
  const rawRank = value.slice(0, -1);
  const red = rawRank === "0" && (suit === "m" || suit === "p" || suit === "s");
  const rank = red ? "5" : rawRank || "?";
  const displayName = formatTileName(value);
  const face = suit === "z" ? displayName : rank;
  const honor = honorLabels[value];
  const subLabel = red ? `${suitLabels[suit]} 赤` : suitLabels[suit] ?? suit;
  const title = honor ? `${value} ${honor}` : red ? `${value} 赤五${suitLabels[suit] ?? ""}` : `${value} ${rank}${suitLabels[suit] ?? suit}`;

  return {
    face,
    red,
    suit,
    subLabel,
    title,
  };
}

function isSourceTile(call: PlaybackCall, index: number) {
  const from = call.froms?.[index];
  return typeof from === "number" && from >= 0 && from <= 3 && from !== call.seat;
}

function formatCallSource(froms: number[] | undefined, seat: PlaybackSeat) {
  if (!froms?.length) {
    return "";
  }

  const sources = Array.from(new Set(froms.filter((from) => from >= 0 && from <= 3 && from !== seat)));

  if (!sources.length) {
    return "";
  }

  return `来自${sources.map((source) => windLabels[source as PlaybackSeat]).join("/")}`;
}

function createTileKeyHandler(value: string, onToggleTile: ((value: string) => void) | undefined) {
  return (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!onToggleTile || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onToggleTile(value);
  };
}

const windLabels: Record<PlaybackSeat, string> = {
  0: "东",
  1: "南",
  2: "西",
  3: "北",
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
