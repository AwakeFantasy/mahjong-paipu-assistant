"use client";

import { useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { CallMeld, Tile, TileBack, TileRiver } from "@/components/paipu/tiles";
import { eventProgressLabel } from "@/components/paipu/event-format";
import type { PlaybackCall, PlaybackSeat, PlaybackState } from "@/lib/majsoul/playback";
import { formatTileName } from "../../lib/majsoul/tile-format";
import type { AnalysisEngineRecommendation, DecisionDifference, EngineOverlay, Player, Round } from "@/lib/majsoul/types";

export type PaipuTableProps = {
  players: Player[];
  selectedRound: Round | null;
  activePlayer: Player;
  playback: PlaybackState | null;
  currentEventText: string;
  currentEventSeatText: string;
  controlsSlot: ReactNode;
  engineOverlay?: EngineOverlay;
  decisionDifference?: DecisionDifference | null;
  revealOpponentHands?: boolean;
  onSelectSeat?: (seat: PlaybackSeat) => void;
};

type SeatPosition = "target" | "right" | "top" | "left";

type TileHighlightProps = {
  highlightedTile?: string | null;
  selectedTile?: string | null;
  onHoverTile?: (value: string | null) => void;
  onToggleTile?: (value: string) => void;
};

type HandRecommendationBadge = {
  label: string;
  tone: "gold" | "green";
};

type HandRecommendationBadges = {
  byTile: Record<string, HandRecommendationBadge>;
  actualTile?: string;
};

const relativeLabels: Record<SeatPosition, string> = {
  target: "目标",
  right: "下家",
  top: "对家",
  left: "上家",
};

const windNames = ["东", "南", "西", "北"];
const hiddenOpponentTiles = 13;
const tenhouTileUnitPx = 50;
const tenhouTableUnits = { width: 20, height: 15.2 };
const tenhouTableSize = { width: tenhouTableUnits.width * tenhouTileUnitPx, height: tenhouTableUnits.height * tenhouTileUnitPx };
const tenhouTileWidthU = 0.72;
const tenhouTileHeightU = 0.96;
const tenhouRiverCols = 6;
const tenhouCenterRows = 4;
const tenhouInnerInsetU = 2.32;
const tenhouHandInnerGapU = 1.24;
const tenhouRiichiRiverWidthU = tenhouTileHeightU;
const tenhouRiverLongU = tenhouRiverCols * tenhouTileWidthU;
const tenhouTheoreticalRiverLongU = (tenhouRiverCols - 1) * tenhouTileWidthU + Math.max(tenhouTileWidthU, tenhouRiichiRiverWidthU);
const tenhouCenterSideU = Math.max(tenhouCenterRows * tenhouTileHeightU, tenhouTheoreticalRiverLongU);
const tenhouTableCenter = {
  x: tenhouTableUnits.width / 2,
  y: tenhouTableUnits.height / 2,
};
const tenhouHandLongU = 14 * tenhouTileWidthU;

type TenhouRegionKey =
  | "topHand"
  | "rightHand"
  | "bottomHand"
  | "leftHand"
  | "topRiver"
  | "rightRiver"
  | "bottomRiver"
  | "leftRiver"
  | "center"
  | "topPlayer"
  | "rightPlayer"
  | "bottomPlayer"
  | "leftPlayer";

type TenhouRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  rotate?: number;
  zIndex?: number;
};

const tenhouRegions: Record<TenhouRegionKey, TenhouRegion> = {
  topHand: { x: tenhouTableCenter.x + tenhouHandLongU / 2, y: tenhouInnerInsetU - tenhouHandInnerGapU, w: tenhouHandLongU, h: tenhouTileHeightU, label: "top-hand", rotate: 180 },
  rightHand: { x: tenhouTableUnits.width - tenhouInnerInsetU + tenhouHandInnerGapU, y: tenhouTableCenter.y + tenhouHandLongU / 2, w: tenhouHandLongU, h: tenhouTileHeightU, label: "right-hand", rotate: -90 },
  bottomHand: { x: tenhouTableCenter.x - tenhouHandLongU / 2, y: tenhouTableUnits.height - tenhouInnerInsetU + tenhouHandInnerGapU, w: tenhouHandLongU, h: tenhouTileHeightU, label: "bottom-hand" },
  leftHand: { x: tenhouInnerInsetU - tenhouHandInnerGapU, y: tenhouTableCenter.y - tenhouHandLongU / 2, w: tenhouHandLongU, h: tenhouTileHeightU, label: "left-hand", rotate: 90 },
  topRiver: { x: tenhouTableCenter.x + tenhouRiverLongU / 2, y: tenhouTableCenter.y - tenhouCenterSideU / 2, w: tenhouRiverLongU, h: tenhouCenterSideU, label: "top-river", rotate: 180 },
  rightRiver: { x: tenhouTableCenter.x + tenhouCenterSideU / 2, y: tenhouTableCenter.y + tenhouRiverLongU / 2, w: tenhouRiverLongU, h: tenhouCenterSideU, label: "right-river", rotate: -90 },
  bottomRiver: { x: tenhouTableCenter.x - tenhouRiverLongU / 2, y: tenhouTableCenter.y + tenhouCenterSideU / 2, w: tenhouRiverLongU, h: tenhouCenterSideU, label: "bottom-river" },
  leftRiver: { x: tenhouTableCenter.x - tenhouCenterSideU / 2, y: tenhouTableCenter.y - tenhouRiverLongU / 2, w: tenhouRiverLongU, h: tenhouCenterSideU, label: "left-river", rotate: 90 },
  center: { x: tenhouTableCenter.x - tenhouCenterSideU / 2, y: tenhouTableCenter.y - tenhouCenterSideU / 2, w: tenhouCenterSideU, h: tenhouCenterSideU, label: "center", zIndex: 20 },
  topPlayer: { x: tenhouTableCenter.x - 1.4, y: 1.18, w: 2.8, h: 0.6, label: "top-player", zIndex: 40 },
  rightPlayer: { x: 16, y: tenhouTableCenter.y - 0.3, w: 2.84, h: 0.6, label: "right-player", zIndex: 40 },
  bottomPlayer: { x: tenhouTableCenter.x - 1.4, y: 13.46, w: 2.8, h: 0.6, label: "bottom-player", zIndex: 40 },
  leftPlayer: { x: 1.16, y: tenhouTableCenter.y - 0.3, w: 2.84, h: 0.6, label: "left-player", zIndex: 40 },
};

export function PaipuTable({
  players,
  selectedRound,
  activePlayer,
  playback,
  currentEventText,
  currentEventSeatText,
  controlsSlot,
  engineOverlay,
  decisionDifference,
  revealOpponentHands = false,
  onSelectSeat,
}: PaipuTableProps) {
  const [hoveredTile, setHoveredTile] = useState<string | null>(null);
  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const seats = getRelativeSeats(activePlayer.seat);
  const playersBySeat = getPlayersBySeat(players);
  const calls = playback?.calls ?? emptyCalls();
  const discards = playback?.discards ?? emptyDiscards();
  const riichiTiles = playback?.riichiTiles ?? emptyRiichiTiles();
  const hands = playback?.hands ?? emptyHands();
  const targetHand = playback?.targetHand ?? selectedRound?.initialHands[activePlayer.seat] ?? [];
  const currentDiscard = getCurrentDiscard(playback);
  const handRecommendationBadges = buildHandRecommendationBadges(engineOverlay, decisionDifference);
  const highlightedTile = hoveredTile ?? selectedTile;
  const highlightProps = {
    highlightedTile,
    selectedTile,
    onHoverTile: setHoveredTile,
    onToggleTile: (tile: string) => {
      setSelectedTile((current) => (current === tile ? null : tile));
    },
  };

  return (
    <div
      className="max-w-full space-y-3 overflow-hidden rounded-xl border border-emerald-950/20 bg-[#1d503f] p-2.5 text-white shadow-sm sm:p-4"
      aria-label={highlightedTile ? `Paipu table, highlighting ${highlightedTile}` : "Paipu table"}
      data-paipu-table="true"
      data-paipu-highlighted-tile={highlightedTile ?? undefined}
      data-paipu-selected-tile={selectedTile ?? undefined}
      onClick={handleTableBlankClick(setSelectedTile)}
    >
      <TenhouDesktopTable
        playersBySeat={playersBySeat}
        seats={seats}
        activePlayer={activePlayer}
        selectedRound={selectedRound}
        playback={playback}
        hands={hands}
        targetHand={targetHand}
        revealOpponentHands={revealOpponentHands}
        discards={discards}
        calls={calls}
        riichiTiles={riichiTiles}
        currentDiscard={currentDiscard}
        currentEventText={currentEventText}
        currentEventSeatText={currentEventSeatText}
        handRecommendationBadges={handRecommendationBadges}
        onSelectSeat={onSelectSeat}
        {...highlightProps}
      />

      <div className="hidden min-w-0 rounded-lg border border-white/10 bg-emerald-950/35 p-3 lg:block" data-paipu-preserve-selection="true">
        {controlsSlot}
      </div>

      <div className="grid min-w-0 gap-3 lg:hidden">
        <CenterStatus
          selectedRound={selectedRound}
          playback={playback}
          currentEventText={currentEventText}
          currentEventSeatText={currentEventSeatText}
          compact
          {...highlightProps}
        />

        <TargetPlayerArea
          player={activePlayer}
          score={formatTableScore(playback?.scores[activePlayer.seat], activePlayer.score)}
          hand={targetHand}
          drawnTile={playback?.drawnTile}
          discards={discards[activePlayer.seat]}
          riichiIndexes={riichiTiles[activePlayer.seat]}
          currentIndex={currentDiscard?.seat === activePlayer.seat ? currentDiscard.index : undefined}
          moqieIndex={currentDiscard?.seat === activePlayer.seat && currentDiscard.moqie ? currentDiscard.index : undefined}
          calls={calls[activePlayer.seat]}
          controlsSlot={controlsSlot}
          handRecommendationBadges={handRecommendationBadges}
          {...highlightProps}
        />

        {[seats.left, seats.top, seats.right].map((seat) => (
          <SeatArea
            key={seat}
            player={playersBySeat[seat]}
            score={formatTableScore(playback?.scores[seat], playersBySeat[seat].score)}
            label={seat === seats.left ? relativeLabels.left : seat === seats.top ? relativeLabels.top : relativeLabels.right}
            hand={hands[seat]}
            revealHand={revealOpponentHands}
            discards={discards[seat]}
            riichiIndexes={riichiTiles[seat]}
            currentIndex={currentDiscard?.seat === seat ? currentDiscard.index : undefined}
            moqieIndex={currentDiscard?.seat === seat && currentDiscard.moqie ? currentDiscard.index : undefined}
            calls={calls[seat]}
            compact
            {...highlightProps}
          />
        ))}
      </div>
    </div>
  );
}

function TenhouDesktopTable({
  playersBySeat,
  seats,
  activePlayer,
  selectedRound,
  playback,
  hands,
  targetHand,
  revealOpponentHands,
  discards,
  calls,
  riichiTiles,
  currentDiscard,
  currentEventText,
  currentEventSeatText,
  handRecommendationBadges,
  onSelectSeat,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  playersBySeat: Record<PlaybackSeat, Player>;
  seats: Record<SeatPosition, PlaybackSeat>;
  activePlayer: Player;
  selectedRound: Round | null;
  playback: PlaybackState | null;
  hands: PlaybackState["hands"];
  targetHand: string[];
  revealOpponentHands: boolean;
  discards: PlaybackState["discards"];
  calls: PlaybackState["calls"];
  riichiTiles: PlaybackState["riichiTiles"];
  currentDiscard: ReturnType<typeof getCurrentDiscard>;
  currentEventText: string;
  currentEventSeatText: string;
  handRecommendationBadges?: HandRecommendationBadges;
  onSelectSeat?: (seat: PlaybackSeat) => void;
} & TileHighlightProps) {
  return (
    <div className="hidden max-w-full overflow-x-hidden lg:block">
      <div
        className="relative mx-auto overflow-hidden rounded bg-[#242724] text-white shadow-inner"
        style={
          {
            width: tenhouTableSize.width,
            height: tenhouTableSize.height,
            "--tenhou-tile-unit": `${tenhouTileUnitPx}px`,
        } as CSSProperties
        }
        data-paipu-desktop-table="tenhou"
      >
        <div className="absolute border border-black/40 bg-[#2e332f]" style={tenhouUnitInset(1.44)} />
        <div className="absolute border border-black/35" style={tenhouUnitInset(2.32)} />

        <TenhouHand
          position="top"
          regionKey="topHand"
          player={playersBySeat[seats.top]}
          hand={hands[seats.top]}
          revealHand={revealOpponentHands}
          calls={calls[seats.top]}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />
        <TenhouHand
          position="right"
          regionKey="rightHand"
          player={playersBySeat[seats.right]}
          hand={hands[seats.right]}
          revealHand={revealOpponentHands}
          calls={calls[seats.right]}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />
        <TenhouHand
          position="left"
          regionKey="leftHand"
          player={playersBySeat[seats.left]}
          hand={hands[seats.left]}
          revealHand={revealOpponentHands}
          calls={calls[seats.left]}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />
        <TenhouHand
          position="target"
          regionKey="bottomHand"
          player={activePlayer}
          hand={targetHand}
          drawnTile={playback?.drawnTile}
          calls={calls[activePlayer.seat]}
          handRecommendationBadges={handRecommendationBadges}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />

        <TenhouPlayerPlate position="top" regionKey="topPlayer" player={playersBySeat[seats.top]} score={formatTableScore(playback?.scores[seats.top], playersBySeat[seats.top].score)} onSelectSeat={onSelectSeat} />
        <TenhouPlayerPlate position="right" regionKey="rightPlayer" player={playersBySeat[seats.right]} score={formatTableScore(playback?.scores[seats.right], playersBySeat[seats.right].score)} onSelectSeat={onSelectSeat} />
        <TenhouPlayerPlate position="target" regionKey="bottomPlayer" player={activePlayer} score={formatTableScore(playback?.scores[activePlayer.seat], activePlayer.score)} emphasized onSelectSeat={onSelectSeat} />
        <TenhouPlayerPlate position="left" regionKey="leftPlayer" player={playersBySeat[seats.left]} score={formatTableScore(playback?.scores[seats.left], playersBySeat[seats.left].score)} onSelectSeat={onSelectSeat} />

        <TenhouRiver
          seat={seats.top}
          regionKey="topRiver"
          discards={discards[seats.top]}
          riichiIndexes={riichiTiles[seats.top]}
          currentIndex={currentDiscard?.seat === seats.top ? currentDiscard.index : undefined}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />
        <TenhouRiver
          seat={seats.right}
          regionKey="rightRiver"
          discards={discards[seats.right]}
          riichiIndexes={riichiTiles[seats.right]}
          currentIndex={currentDiscard?.seat === seats.right ? currentDiscard.index : undefined}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />
        <TenhouRiver
          seat={activePlayer.seat}
          regionKey="bottomRiver"
          discards={discards[activePlayer.seat]}
          riichiIndexes={riichiTiles[activePlayer.seat]}
          currentIndex={currentDiscard?.seat === activePlayer.seat ? currentDiscard.index : undefined}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />
        <TenhouRiver
          seat={seats.left}
          regionKey="leftRiver"
          discards={discards[seats.left]}
          riichiIndexes={riichiTiles[seats.left]}
          currentIndex={currentDiscard?.seat === seats.left ? currentDiscard.index : undefined}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />

        <TenhouCenterStatus
          selectedRound={selectedRound}
          playback={playback}
          currentEventText={currentEventText}
          currentEventSeatText={currentEventSeatText}
          {...{ highlightedTile, selectedTile, onHoverTile, onToggleTile }}
        />
      </div>
    </div>
  );
}

function TenhouHand({
  position,
  regionKey,
  player,
  hand,
  drawnTile,
  revealHand = false,
  calls,
  handRecommendationBadges,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  position: SeatPosition;
  regionKey: TenhouRegionKey;
  player: Player;
  hand?: string[];
  drawnTile?: string;
  revealHand?: boolean;
  calls: PlaybackCall[];
  handRecommendationBadges?: HandRecommendationBadges;
} & TileHighlightProps) {
  const callTileCount = calls.reduce((count, call) => count + call.tiles.length, 0);
  const placeholderTargetCount = selectedRoundPlaceholderHandCount(position, hand);
  const hiddenCount = Math.max(1, hand?.length ? hand.length : hiddenOpponentTiles - callTileCount);
  const shouldRevealHand = position === "target" || revealHand;
  const visibleHand = shouldRevealHand ? hand ?? [] : [];

  return (
    <TenhouRegionBox regionKey={regionKey}>
      <div className="relative h-full w-full overflow-visible" data-paipu-tenhou-hand={position} title={`${relativeLabels[position]} ${player.name}`}>
        <div className="relative z-20 flex h-full items-center justify-start gap-0 overflow-visible">
          {shouldRevealHand
            ? visibleHand.length
              ? renderHandTiles({
                  hand: visibleHand,
                  drawnTile,
                  highlightedTile,
                  selectedTile,
                  onHoverTile,
                  onToggleTile,
                  handRecommendationBadges: position === "target" ? handRecommendationBadges : undefined,
                })
              : Array.from({ length: placeholderTargetCount }).map((_, index) => <TileBack key={`${position}-placeholder-${index}`} size="normal" />)
            : Array.from({ length: hiddenCount }).map((_, index) => <TileBack key={`${position}-back-${index}`} size="normal" />)}
          {calls.length ? (
            <>
              <TileBodySpacer />
              <TenhouCalls calls={calls} highlightedTile={highlightedTile} selectedTile={selectedTile} onHoverTile={onHoverTile} onToggleTile={onToggleTile} />
            </>
          ) : null}
        </div>
      </div>
    </TenhouRegionBox>
  );
}

function TenhouCalls({ calls, highlightedTile, selectedTile, onHoverTile, onToggleTile }: { calls: PlaybackCall[] } & TileHighlightProps) {
  return (
    <div className="relative z-10 flex shrink-0 flex-row-reverse items-end overflow-visible" data-paipu-tenhou-calls="true">
      {calls.map((call, index) => (
        <div
          key={`${call.eventIndex}-${call.seat}-${call.callType}`}
          className="flex shrink-0 gap-0 rounded bg-zinc-950/35 p-0 shadow-sm"
          style={{ zIndex: calls.length - index }}
        >
          {call.tiles.map((tile, tileIndex) => (
            <Tile
              key={`${tile}-${tileIndex}`}
              value={tile}
              source={tileIndex === 0}
              highlighted={tile === highlightedTile}
              selected={tile === selectedTile}
              onHoverTile={onHoverTile}
              onToggleTile={onToggleTile}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TileBodySpacer() {
  return <span className="h-12 w-9 shrink-0 opacity-0" aria-hidden="true" />;
}

function renderHandTiles({
  hand,
  drawnTile,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
  handRecommendationBadges,
}: {
  hand: string[];
  drawnTile?: string;
  handRecommendationBadges?: HandRecommendationBadges;
} & TileHighlightProps) {
  const drawnIndex = drawnTile && hand.length ? hand.length - 1 : -1;
  const badgeIndexes = resolveHandBadgeIndexes(hand, handRecommendationBadges, drawnIndex);

  return hand.flatMap((tile, index) => {
    const isDrawn = index === drawnIndex;
    const normalizedTile = normalizeTileForRecommendation(tile);
    const badge = badgeIndexes.recommendationByTile[normalizedTile] === index ? handRecommendationBadges?.byTile[normalizedTile] : undefined;
    const renderedTile = (
      <Tile
        key={`${tile}-${index}`}
        value={tile}
        drawn={isDrawn}
        current={false}
        highlighted={tile === highlightedTile}
        selected={tile === selectedTile}
        recommendationBadge={badge?.label}
        recommendationBadgeTone={badge?.tone}
        recommended={Boolean(badge)}
        actualBadge={badgeIndexes.actualIndex === index ? "我切" : undefined}
        onHoverTile={onHoverTile}
        onToggleTile={onToggleTile}
      />
    );

    return isDrawn ? [<TileBodySpacer key="drawn-tile-spacer" />, renderedTile] : [renderedTile];
  });
}

function resolveHandBadgeIndexes(hand: string[], badges: HandRecommendationBadges | undefined, drawnIndex: number) {
  const recommendationByTile: Record<string, number> = {};
  const actualTile = badges?.actualTile;
  const actualIndex = actualTile ? findTileBadgeIndex(hand, actualTile, drawnIndex) : -1;

  for (const tile of Object.keys(badges?.byTile ?? {})) {
    const preferredIndex = tile === actualTile ? actualIndex : -1;
    const index = preferredIndex >= 0 ? preferredIndex : findTileBadgeIndex(hand, tile, drawnIndex);

    if (index >= 0) {
      recommendationByTile[tile] = index;
    }
  }

  return { recommendationByTile, actualIndex };
}

function findTileBadgeIndex(hand: string[], normalizedTile: string, drawnIndex: number) {
  if (drawnIndex >= 0 && normalizeTileForRecommendation(hand[drawnIndex]) === normalizedTile) {
    return drawnIndex;
  }

  return hand.findIndex((tile) => normalizeTileForRecommendation(tile) === normalizedTile);
}

function selectedRoundPlaceholderHandCount(position: SeatPosition, hand?: string[]) {
  if (hand?.length) {
    return hand.length;
  }

  return position === "target" ? 13 : hiddenOpponentTiles;
}

function TenhouPlayerPlate({
  position,
  regionKey,
  player,
  score,
  emphasized = false,
  onSelectSeat,
}: {
  position: SeatPosition;
  regionKey: TenhouRegionKey;
  player: Player;
  score: string;
  emphasized?: boolean;
  onSelectSeat?: (seat: PlaybackSeat) => void;
}) {
  const content = (
    <>
      <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-white/75">{relativeLabels[position]}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
      <span className="shrink-0 tabular-nums text-white/70">{score}</span>
    </>
  );

  return (
    <TenhouRegionBox regionKey={regionKey}>
      {onSelectSeat ? (
        <div
          role="button"
          tabIndex={0}
          className={cx("flex h-full min-w-0 cursor-pointer items-center gap-2 rounded bg-zinc-950/70 px-2 text-[11px] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200", emphasized ? "ring-1 ring-amber-200/70" : "")}
          onClick={(event) => {
            event.stopPropagation();
            onSelectSeat(player.seat as PlaybackSeat);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            onSelectSeat(player.seat as PlaybackSeat);
          }}
          aria-label={`切换到 ${player.name} 视角`}
          title={`切换到 ${player.name} 视角`}
          data-paipu-preserve-selection="true"
        >
          {content}
        </div>
      ) : (
        <div className={cx("flex h-full min-w-0 items-center gap-2 rounded bg-zinc-950/70 px-2 text-[11px] shadow-sm", emphasized ? "ring-1 ring-amber-200/70" : "")}>{content}</div>
      )}
    </TenhouRegionBox>
  );
}

function TenhouRiver({
  regionKey,
  discards,
  riichiIndexes,
  currentIndex,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  seat: PlaybackSeat;
  regionKey: TenhouRegionKey;
  discards: string[];
  riichiIndexes: number[];
  currentIndex?: number;
} & TileHighlightProps) {
  const rows = chunkTiles(discards, 6);

  return (
    <TenhouRegionBox regionKey={regionKey}>
      <div className="flex h-full w-full flex-col items-start gap-0 overflow-visible p-0" data-paipu-tenhou-river="true">
        {rows.map((row, rowIndex) => (
          <div key={`${regionKey}-row-${rowIndex}`} className="flex gap-0">
            {row.map(({ tile, index }) => (
              <TenhouRiverTile
                key={`${regionKey}-${tile}-${index}`}
                tile={tile}
                riichi={riichiIndexes.includes(index)}
                current={index === currentIndex}
                highlighted={tile === highlightedTile}
                selected={tile === selectedTile}
                onHoverTile={onHoverTile}
                onToggleTile={onToggleTile}
              />
            ))}
          </div>
        ))}
      </div>
    </TenhouRegionBox>
  );
}

function TenhouRiverTile({
  tile,
  riichi,
  current,
  highlighted,
  selected,
  onHoverTile,
  onToggleTile,
}: {
  tile: string;
  riichi: boolean;
  current: boolean;
  highlighted?: boolean;
  selected?: boolean;
  onHoverTile?: (value: string | null) => void;
  onToggleTile?: (value: string) => void;
}) {
  if (riichi) {
    return (
      <span className="grid h-9 w-12 place-items-center overflow-visible">
        <Tile value={tile} current={current} highlighted={highlighted} selected={selected} flat onHoverTile={onHoverTile} onToggleTile={onToggleTile} className="rotate-90" />
      </span>
    );
  }

  return <Tile value={tile} current={current} highlighted={highlighted} selected={selected} flat onHoverTile={onHoverTile} onToggleTile={onToggleTile} />;
}

function TenhouCenterStatus({
  selectedRound,
  playback,
  currentEventText,
  currentEventSeatText,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  selectedRound: Round | null;
  playback: PlaybackState | null;
  currentEventText: string;
  currentEventSeatText: string;
} & TileHighlightProps) {
  const doraIndicators = playback?.doraIndicators ?? selectedRound?.doraIndicators ?? [];
  const remainingTiles = playback?.remainingTiles;
  const riichiSticks = playback?.riichiSticks ?? selectedRound?.riichiSticks ?? 0;
  const roundStatus = selectedRound
    ? `${selectedRound.honba}本场 / 供托${riichiSticks}${typeof remainingTiles === "number" ? ` / 余牌${remainingTiles}` : ""}`
    : "待读取";

  return (
    <TenhouRegionBox regionKey="center">
      <section className="relative grid h-full min-w-0 place-items-center rounded-sm border border-white/20 bg-zinc-950/75 p-2 text-center shadow-lg" data-paipu-tenhou-center="true">
        <CenterWindMark className="left-1 top-1" label="北" rotate="rotate-90" />
        <CenterWindMark className="right-1 top-1" label="西" rotate="rotate-180" />
        <CenterWindMark className="bottom-1 right-1" label="南" rotate="-rotate-90" />
        <CenterWindMark className="bottom-1 left-1" label="东" />

        <div className="min-w-0 px-5 text-xs leading-5">
          <p className="truncate font-semibold">{selectedRound?.title ?? "牌谱"}</p>
          <p className="truncate text-white/65">{roundStatus}</p>
          <p className="truncate text-white/65">{eventProgressLabel(playback?.visibleCount ?? 0, selectedRound?.events.length ?? 0)} / {currentEventSeatText}</p>
        </div>
        <div className="flex max-w-full items-center justify-center gap-1 overflow-hidden px-5">
          <span className="shrink-0 text-[10px] text-white/55">宝牌指示牌</span>
          {doraIndicators.length ? (
            doraIndicators.map((tile, index) => (
              <Tile key={`${tile}-${index}`} value={tile} size="compact" highlighted={tile === highlightedTile} selected={tile === selectedTile} onHoverTile={onHoverTile} onToggleTile={onToggleTile} />
            ))
          ) : (
            <span className="text-xs text-white/45">暂无宝牌指示牌</span>
          )}
        </div>
        <p className="max-w-full truncate text-[11px] text-white/70">{playback?.roundResult ?? currentEventText}</p>
      </section>
    </TenhouRegionBox>
  );
}

function CenterWindMark({ className, label, rotate }: { className: string; label: string; rotate?: string }) {
  return (
    <span className={`pointer-events-none absolute grid h-5 w-5 place-items-center rounded-sm border border-white/20 bg-white/10 text-[11px] font-bold leading-none text-white/80 ${className}`}>
      <span className={rotate}>{label}</span>
    </span>
  );
}

function buildHandRecommendationBadges(overlay: EngineOverlay | undefined, difference: DecisionDifference | null | undefined): HandRecommendationBadges | undefined {
  const byTile: Record<string, HandRecommendationBadge> = {};

  if (overlay?.status === "available") {
    for (const recommendation of overlay.recommendations.slice(0, 3)) {
      if (!isHandTileRecommendation(recommendation) || typeof recommendation.probability !== "number" || !Number.isFinite(recommendation.probability)) {
        continue;
      }

      const tile = normalizeTileForRecommendation(recommendation.tile);
      const existing = byTile[tile];
      if (existing && existing.tone === "gold") {
        continue;
      }

      byTile[tile] = {
        label: `${Math.round(recommendation.probability * 100)}%`,
        tone: recommendation.rank === 1 ? "gold" : "green",
      };
    }
  }

  const actualTile =
    difference?.point.actualTile && (difference.point.actualAction === "discard" || difference.point.actualAction === "riichi")
      ? normalizeTileForRecommendation(difference.point.actualTile)
      : undefined;

  if (!Object.keys(byTile).length && !actualTile) {
    return undefined;
  }

  return { byTile, actualTile };
}

function isHandTileRecommendation(recommendation: AnalysisEngineRecommendation) {
  return Boolean(recommendation.tile && (recommendation.action === "discard" || recommendation.action === "riichi"));
}

function normalizeTileForRecommendation(tile: string | undefined) {
  if (!tile) {
    return "";
  }

  const normalized = tile.trim().toLowerCase();
  const redFive = normalized.match(/^5([mps])r$/);
  if (redFive) {
    return `0${redFive[1]}`;
  }

  return normalized;
}

function TenhouRegionBox({ regionKey, children }: { regionKey: TenhouRegionKey; children: ReactNode }) {
  const region = tenhouRegions[regionKey];

  return (
    <div className="absolute" style={tenhouRegionStyle(region)} data-paipu-tenhou-region={region.label}>
      {children}
    </div>
  );
}

function SeatArea({
  player,
  score,
  label,
  hand = [],
  revealHand = false,
  discards,
  riichiIndexes,
  currentIndex,
  moqieIndex,
  calls,
  compact = false,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  player: Player;
  score: string;
  label: string;
  hand?: string[];
  revealHand?: boolean;
  discards: string[];
  riichiIndexes: number[];
  currentIndex?: number;
  moqieIndex?: number;
  calls: PlaybackCall[];
  compact?: boolean;
} & TileHighlightProps) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-md border border-white/10 bg-zinc-950/20 p-3 shadow-inner">
      <PlayerHeader player={player} score={score} label={label} />
      <OpponentHandStrip hand={hand} revealHand={revealHand} />
      <DiscardRiver
        discards={discards}
        riichiIndexes={riichiIndexes}
        currentIndex={currentIndex}
        moqieIndex={moqieIndex}
        limit={compact ? 18 : 30}
        highlightedTile={highlightedTile}
        selectedTile={selectedTile}
        onHoverTile={onHoverTile}
        onToggleTile={onToggleTile}
      />
      <CallStrip
        calls={calls}
        highlightedTile={highlightedTile}
        selectedTile={selectedTile}
        onHoverTile={onHoverTile}
        onToggleTile={onToggleTile}
      />
    </section>
  );
}

function OpponentHandStrip({ hand, revealHand }: { hand: string[]; revealHand: boolean }) {
  const visibleTiles = revealHand ? hand : [];
  const hiddenCount = revealHand ? 0 : Math.max(1, hand.length || hiddenOpponentTiles);

  return (
    <div className="mt-3 min-w-0">
      <p className="mb-2 text-xs text-white/65">{revealHand ? "他家手牌" : "牌背"}</p>
      <div className="flex min-h-10 max-w-full gap-1 overflow-x-auto pb-1">
        {visibleTiles.length
          ? visibleTiles.map((tile, index) => <Tile key={`${tile}-${index}`} value={tile} size="compact" />)
          : Array.from({ length: hiddenCount }).map((_, index) => <TileBack key={`mobile-back-${index}`} size="compact" />)}
      </div>
    </div>
  );
}

function CenterStatus({
  selectedRound,
  playback,
  currentEventText,
  currentEventSeatText,
  compact = false,
  desktop = false,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  selectedRound: Round | null;
  playback: PlaybackState | null;
  currentEventText: string;
  currentEventSeatText: string;
  compact?: boolean;
  desktop?: boolean;
} & TileHighlightProps) {
  return (
    <section
      className={cx(
        "min-w-0 max-w-full border border-white/20 bg-zinc-950/35 p-3 shadow-inner sm:p-4",
        desktop ? "rounded-2xl" : "rounded-md",
        compact ? "min-h-[170px] w-full" : "w-full",
      )}
      data-paipu-center-status={desktop ? "desktop" : "mobile"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cx("truncate font-semibold", desktop ? "text-base" : "text-xl")}>{selectedRound?.dealer ?? "牌谱"}</p>
          <p className={cx("mt-1 text-white/70", desktop ? "text-xs" : "text-xs sm:text-sm")}>
            {selectedRound ? eventProgressLabel(playback?.visibleCount ?? 0, selectedRound.events.length) : "待读取"}
          </p>
        </div>
        <span className="max-w-[45%] shrink-0 truncate rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/80">
          {currentEventSeatText}
        </span>
      </div>

      <DoraIndicators
        tiles={playback?.doraIndicators ?? selectedRound?.doraIndicators ?? []}
        compact={desktop}
        highlightedTile={highlightedTile}
        selectedTile={selectedTile}
        onHoverTile={onHoverTile}
        onToggleTile={onToggleTile}
      />

      <div className={cx("mt-3 min-w-0 break-words rounded-md border border-white/15 bg-white/10 text-white/90", desktop ? "mt-2 max-h-10 overflow-hidden p-2 text-xs leading-5" : "min-h-[72px] p-3 text-sm leading-6")}>
        {currentEventText}
      </div>
      {playback?.roundResult ? <p className="mt-3 truncate text-sm font-medium text-amber-100">{playback.roundResult}</p> : null}
    </section>
  );
}

function DoraIndicators({
  tiles,
  compact = false,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  tiles: string[];
  compact?: boolean;
} & TileHighlightProps) {
  if (compact) {
    return (
      <div className="mt-2 flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md border border-white/15 bg-black/10 p-2">
        <span className="shrink-0 text-xs text-white/65">宝牌指示牌</span>
        <div className="flex min-h-9 min-w-0 flex-1 flex-wrap content-start gap-1 overflow-hidden">
          {tiles.length ? (
            tiles.map((tile, index) => (
              <Tile
                key={`${tile}-${index}`}
                value={tile}
                size="compact"
                highlighted={tile === highlightedTile}
                selected={tile === selectedTile}
                onHoverTile={onHoverTile}
                onToggleTile={onToggleTile}
              />
            ))
          ) : (
            <span className="py-1 text-xs text-white/45">暂无宝牌指示牌</span>
          )}
        </div>
        {tiles.length ? <span className="shrink-0 text-xs tabular-nums text-white/55">{tiles.length}</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-md border border-white/15 bg-black/10 p-2.5">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-xs text-white/65">
        <span className="shrink-0">宝牌指示牌</span>
        {tiles.length ? <span className="truncate tabular-nums">共{tiles.length}枚</span> : null}
      </div>
      <div className="flex min-h-9 max-w-full min-w-0 flex-wrap content-start gap-1 overflow-hidden">
        {tiles.length ? (
          tiles.map((tile, index) => (
            <Tile
              key={`${tile}-${index}`}
              value={tile}
              size="compact"
              highlighted={tile === highlightedTile}
              selected={tile === selectedTile}
              onHoverTile={onHoverTile}
              onToggleTile={onToggleTile}
            />
          ))
        ) : (
          <span className="py-1 text-xs text-white/45">暂无宝牌指示牌</span>
        )}
      </div>
    </div>
  );
}

function TargetPlayerArea({
  player,
  score,
  hand,
  drawnTile,
  discards,
  riichiIndexes,
  currentIndex,
  moqieIndex,
  calls,
  controlsSlot,
  desktop = false,
  handRecommendationBadges,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  player: Player;
  score: string;
  hand: string[];
  drawnTile?: string;
  discards: string[];
  riichiIndexes: number[];
  currentIndex?: number;
  moqieIndex?: number;
  calls: PlaybackCall[];
  controlsSlot: ReactNode;
  desktop?: boolean;
  handRecommendationBadges?: HandRecommendationBadges;
} & TileHighlightProps) {
  return (
    <section
      className={cx(
        "min-w-0 max-w-full rounded-xl border border-amber-100/35 bg-emerald-950/35 p-3 ring-1 ring-amber-100/20",
        desktop ? "shadow-[0_10px_32px_rgba(0,0,0,0.22)]" : "",
      )}
      data-paipu-seat-position="target"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PlayerHeader player={player} score={score} label={relativeLabels.target} emphasized />
      </div>

      <div className="mt-3 min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/65">
          <span>手牌</span>
          {drawnTile ? <span className="truncate">摸牌 {formatTileName(drawnTile)}</span> : null}
        </div>
        <div className="flex min-h-[54px] max-w-full gap-1.5 overflow-x-auto pb-1">
          {hand.length
            ? renderHandTiles({
                hand,
                drawnTile,
                highlightedTile,
                selectedTile,
                onHoverTile,
                onToggleTile,
                handRecommendationBadges,
              })
            : null}
          {!hand.length ? <p className="text-sm text-white/65">等待真实起手牌</p> : null}
        </div>
      </div>

      <div className={cx("mt-3 grid min-w-0 gap-3", desktop ? "grid-cols-[minmax(0,1fr)_minmax(160px,220px)]" : "md:grid-cols-[minmax(0,1fr)_minmax(180px,240px)]")}>
        <div className="min-w-0">
          <p className="mb-2 text-xs text-white/65">目标玩家牌河</p>
          <DiscardRiver
            discards={discards}
            riichiIndexes={riichiIndexes}
            currentIndex={currentIndex}
            moqieIndex={moqieIndex}
            limit={36}
            orientation="target"
            highlightedTile={highlightedTile}
            selectedTile={selectedTile}
            onHoverTile={onHoverTile}
            onToggleTile={onToggleTile}
          />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs text-white/65">目标玩家副露</p>
          <CallStrip
            calls={calls}
            tall
            highlightedTile={highlightedTile}
            selectedTile={selectedTile}
            onHoverTile={onHoverTile}
            onToggleTile={onToggleTile}
          />
        </div>
      </div>

      {controlsSlot ? (
        <div className="mt-3 min-w-0 max-w-full" data-paipu-preserve-selection="true">
          {controlsSlot}
        </div>
      ) : null}
    </section>
  );
}

function PlayerHeader({ player, score, label, emphasized = false }: { player: Player; score: string; label: string; emphasized?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${emphasized ? "bg-amber-100 text-emerald-950" : "bg-white/15 text-white/80"}`}>
            {label}
          </span>
          <p className="truncate text-sm font-semibold">{player.name}</p>
        </div>
        <p className="mt-1 truncate text-xs tabular-nums text-white/65">{score}</p>
      </div>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-white text-sm font-semibold text-zinc-950">
        {formatWind(player)}
      </span>
    </div>
  );
}

function DiscardRiver({
  discards,
  riichiIndexes,
  currentIndex,
  moqieIndex,
  limit,
  dense = false,
  tileClassName,
  orientation,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  discards: string[];
  riichiIndexes: number[];
  currentIndex?: number;
  moqieIndex?: number;
  limit: number;
  dense?: boolean;
  tileClassName?: string;
  orientation?: SeatPosition;
} & TileHighlightProps) {
  return (
    <div data-paipu-river-orientation={orientation}>
      <TileRiver
        tiles={discards}
        riichiIndexes={riichiIndexes}
        currentIndex={currentIndex}
        drawnIndexes={typeof moqieIndex === "number" ? [moqieIndex] : []}
        maxVisible={limit}
        emptyLabel="暂无切牌"
        className={cx("min-h-20 border-white/10 bg-transparent shadow-none", dense ? "max-h-[250px]" : "max-h-32")}
        tileClassName={tileClassName}
        flatTiles
        highlightedTile={highlightedTile}
        selectedTile={selectedTile}
        onHoverTile={onHoverTile}
        onToggleTile={onToggleTile}
      />
    </div>
  );
}

function CallStrip({
  calls,
  tall = false,
  compactEmpty = false,
  tileClassName,
  highlightedTile,
  selectedTile,
  onHoverTile,
  onToggleTile,
}: {
  calls: PlaybackCall[];
  tall?: boolean;
  compactEmpty?: boolean;
  tileClassName?: string;
} & TileHighlightProps) {
  return (
    <div
      className={`mt-3 flex min-w-0 flex-wrap gap-2 overflow-y-auto rounded border border-white/10 bg-black/10 p-1.5 ${
        tall ? "max-h-32 min-h-20" : "max-h-24 min-h-10"
      }`}
    >
      {calls.map((call) => (
        <CallMeld
          key={`${call.eventIndex}-${call.seat}-${call.callType}`}
          call={call}
          compact
          className="shrink-0"
          tileClassName={tileClassName}
          highlightedTile={highlightedTile}
          selectedTile={selectedTile}
          onHoverTile={onHoverTile}
          onToggleTile={onToggleTile}
        />
      ))}
      {!calls.length ? <span className={cx("text-xs text-white/45", compactEmpty ? "py-1" : "")}>暂无副露</span> : null}
    </div>
  );
}

function formatTableScore(score: number | undefined, fallback: string) {
  return typeof score === "number" && Number.isFinite(score) ? new Intl.NumberFormat("en-US").format(score) : fallback;
}

function handleTableBlankClick(setSelectedTile: (value: string | null) => void) {
  return (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-paipu-tile='true']") || target.closest("[data-paipu-preserve-selection='true']")) {
      return;
    }

    setSelectedTile(null);
  };
}

function getRelativeSeats(targetSeat: PlaybackSeat): Record<SeatPosition, PlaybackSeat> {
  return {
    target: targetSeat,
    right: ((targetSeat + 1) % 4) as PlaybackSeat,
    top: ((targetSeat + 2) % 4) as PlaybackSeat,
    left: ((targetSeat + 3) % 4) as PlaybackSeat,
  };
}

function getCurrentDiscard(playback: PlaybackState | null) {
  if (!playback?.currentEvent || playback.currentEvent.type !== "discard") {
    return null;
  }

  const seat = playback.currentEvent.seat as PlaybackSeat;
  return {
    seat,
    index: Math.max(0, playback.discards[seat].length - 1),
    moqie: playback.currentEvent.moqie,
  };
}

function getPlayersBySeat(players: Player[]): Record<PlaybackSeat, Player> {
  return {
    0: players.find((player) => player.seat === 0) ?? fallbackPlayer(0),
    1: players.find((player) => player.seat === 1) ?? fallbackPlayer(1),
    2: players.find((player) => player.seat === 2) ?? fallbackPlayer(2),
    3: players.find((player) => player.seat === 3) ?? fallbackPlayer(3),
  };
}

function fallbackPlayer(seat: PlaybackSeat): Player {
  return {
    seat,
    wind: ["E", "S", "W", "N"][seat] as Player["wind"],
    name: `${windNames[seat]}家`,
    startScore: 25000,
    score: "25,000",
    style: "待读取",
  };
}

function formatWind(player: Player) {
  const windByCode: Record<string, string> = {
    E: "东",
    S: "南",
    W: "西",
    N: "北",
  };

  return (player.wind ? windByCode[player.wind] : undefined) ?? windNames[player.seat];
}

function emptyDiscards(): PlaybackState["discards"] {
  return { 0: [], 1: [], 2: [], 3: [] };
}

function emptyCalls(): PlaybackState["calls"] {
  return { 0: [], 1: [], 2: [], 3: [] };
}

function emptyHands(): PlaybackState["hands"] {
  return { 0: [], 1: [], 2: [], 3: [] };
}

function emptyRiichiTiles(): PlaybackState["riichiTiles"] {
  return { 0: [], 1: [], 2: [], 3: [] };
}

function tenhouRegionStyle(region: TenhouRegion): CSSProperties {
  return {
    left: tenhouUnit(region.x),
    top: tenhouUnit(region.y),
    width: tenhouUnit(region.w),
    height: tenhouUnit(region.h),
    zIndex: region.zIndex,
    transform: region.rotate ? `rotate(${region.rotate}deg)` : undefined,
    transformOrigin: region.rotate ? "top left" : undefined,
  };
}

function tenhouUnit(value: number) {
  return `calc(${value} * var(--tenhou-tile-unit))`;
}

function tenhouUnitInset(value: number): CSSProperties {
  const inset = tenhouUnit(value);

  return {
    left: inset,
    right: inset,
    top: inset,
    bottom: inset,
  };
}

function chunkTiles(tiles: string[], size: number) {
  const rows: Array<Array<{ tile: string; index: number }>> = [];

  for (let index = 0; index < tiles.length; index += size) {
    rows.push(tiles.slice(index, index + size).map((tile, offset) => ({ tile, index: index + offset })));
  }

  return rows;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
