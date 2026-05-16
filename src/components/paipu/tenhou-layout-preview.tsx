import { CircleDot } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Tile, TileBack } from "@/components/paipu/tiles";

type PreviewSeat = "bottom" | "right" | "top" | "left";
type RegionKey =
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

type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  rotate?: number;
};

const tileUnitPx = 50;
const tableUnits = { width: 20, height: 15.2 };
const tableSize = { width: tableUnits.width * tileUnitPx, height: tableUnits.height * tileUnitPx };
const tileWidthU = 0.72;
const tileHeightU = 0.96;
const riverCols = 6;
const centerRows = 4;
const innerInsetU = 2.32;
const handInnerGapU = 1.24;
const riichiRiverWidthU = tileHeightU;
const riverLongU = riverCols * tileWidthU;
const theoreticalRiverLongU = (riverCols - 1) * tileWidthU + Math.max(tileWidthU, riichiRiverWidthU);
const centerSideU = Math.max(centerRows * tileHeightU, theoreticalRiverLongU);
const tableCenter = {
  x: tableUnits.width / 2,
  y: tableUnits.height / 2,
};
const handLongU = 14 * tileWidthU;

const regions: Record<RegionKey, Region> = {
  topHand: { x: tableCenter.x + handLongU / 2, y: innerInsetU - handInnerGapU, w: handLongU, h: tileHeightU, label: "top-hand", rotate: 180 },
  rightHand: { x: tableUnits.width - innerInsetU + handInnerGapU, y: tableCenter.y + handLongU / 2, w: handLongU, h: tileHeightU, label: "right-hand", rotate: -90 },
  bottomHand: { x: tableCenter.x - handLongU / 2, y: tableUnits.height - innerInsetU + handInnerGapU, w: handLongU, h: tileHeightU, label: "bottom-hand" },
  leftHand: { x: innerInsetU - handInnerGapU, y: tableCenter.y - handLongU / 2, w: handLongU, h: tileHeightU, label: "left-hand", rotate: 90 },
  topRiver: { x: tableCenter.x + riverLongU / 2, y: tableCenter.y - centerSideU / 2, w: riverLongU, h: centerSideU, label: "top-river", rotate: 180 },
  rightRiver: { x: tableCenter.x + centerSideU / 2, y: tableCenter.y + riverLongU / 2, w: riverLongU, h: centerSideU, label: "right-river", rotate: -90 },
  bottomRiver: { x: tableCenter.x - riverLongU / 2, y: tableCenter.y + centerSideU / 2, w: riverLongU, h: centerSideU, label: "bottom-river" },
  leftRiver: { x: tableCenter.x - centerSideU / 2, y: tableCenter.y - riverLongU / 2, w: riverLongU, h: centerSideU, label: "left-river", rotate: 90 },
  center: { x: tableCenter.x - centerSideU / 2, y: tableCenter.y - centerSideU / 2, w: centerSideU, h: centerSideU, label: "center" },
  topPlayer: { x: tableCenter.x - 1.4, y: 1.18, w: 2.8, h: 0.6, label: "top-player" },
  rightPlayer: { x: 16, y: tableCenter.y - 0.3, w: 2.84, h: 0.6, label: "right-player" },
  bottomPlayer: { x: tableCenter.x - 1.4, y: 13.46, w: 2.8, h: 0.6, label: "bottom-player" },
  leftPlayer: { x: 1.16, y: tableCenter.y - 0.3, w: 2.84, h: 0.6, label: "left-player" },
};

const seatLabels: Record<PreviewSeat, string> = {
  bottom: "目标 / 东",
  right: "下家 / 南",
  top: "对家 / 西",
  left: "上家 / 北",
};

const playerNames: Record<PreviewSeat, string> = {
  bottom: "刹那の未来。",
  right: "小瑜2",
  top: "KayleJax",
  left: "awakefantasy",
};

const scores: Record<PreviewSeat, string> = {
  bottom: "25,000",
  right: "31,200",
  top: "18,700",
  left: "25,100",
};

const rivers: Record<PreviewSeat, string[]> = {
  bottom: ["1m", "7m", "2p", "9p", "3s", "8s", "2z", "5z", "0p", "4m", "4p", "7s", "1z", "6z", "8m", "3p", "9s", "7z", "2m", "5p", "6s", "4z", "3m", "1p"],
  right: ["9m", "8m", "1p", "2p", "7p", "1s", "4s", "9s", "1z", "3z", "5z", "6z", "2m", "6m", "0s", "3p", "8p", "7s"],
  top: ["3m", "4m", "6m", "2p", "4p", "8p", "2s", "5s", "6s", "7s", "1z", "4z", "7z", "1m", "9m", "3p", "0m", "8s"],
  left: ["2m", "5m", "7m", "9m", "1p", "5p", "6p", "9p", "3s", "6s", "8s", "2z", "3z", "4z", "5z", "7z", "4m", "0p"],
};

const bottomHand = ["1m", "2m", "3m", "7m", "8m", "9m", "2p", "3p", "0p", "4s", "5s", "6s", "6z", "7z"];
const doraIndicators = ["3p", "8s", "4z", "2m", "0m"];
const riichiDiscardIndex = 8;

const melds: Record<PreviewSeat, string[][]> = {
  bottom: [
    ["3m", "4m", "5m"],
    ["7p", "7p", "7p"],
    ["6z", "6z", "6z", "6z"],
  ],
  right: [
    ["1p", "2p", "3p"],
    ["5s", "5s", "5s"],
    ["9m", "9m", "9m", "9m"],
  ],
  top: [
    ["2m", "3m", "4m"],
    ["1z", "1z", "1z"],
    ["0p", "5p", "5p", "5p"],
  ],
  left: [
    ["6s", "7s", "8s"],
    ["4z", "4z", "4z"],
    ["3p", "3p", "3p", "3p"],
  ],
};

export function TenhouLayoutPreview({ editMode = false }: { editMode?: boolean }) {
  return (
    <main className="min-h-screen bg-[#f7f7f3] text-zinc-950" data-layout-preview="true" data-layout-edit={editMode ? "true" : "false"}>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-zinc-950 text-white">
              <CircleDot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">Tenhou-style Table Layout v2 预览</h1>
              <p className="truncate text-sm text-zinc-500">固定 mock 极限数据，不连接 API，不影响真实牌谱页面</p>
            </div>
          </div>
          <div className="w-fit rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            layoutPreview=1{editMode ? "&edit=1" : ""}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-4 min-w-0">
            <h2 className="text-base font-semibold">天凤式单位坐标沙盘</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {editMode ? "蓝色虚线框是可调区域，坐标单位为一张牌宽度；手牌、牌河和副露已按座位整体旋转。" : "访问 ?layoutPreview=1&edit=1 可显示区域标尺。"}
            </p>
          </div>

          <TenhouPreviewTable editMode={editMode} />
        </div>
      </section>
    </main>
  );
}

function TenhouPreviewTable({ editMode }: { editMode: boolean }) {
  return (
    <div
      className="relative mx-auto hidden overflow-hidden rounded bg-[#242724] text-white shadow-inner lg:block"
      style={
        {
          width: tableSize.width,
          height: tableSize.height,
          "--preview-tile-unit": `${tileUnitPx}px`,
        } as CSSProperties
      }
      data-tenhou-preview-table="desktop"
    >
      <div className="absolute border border-black/40 bg-[#2e332f]" style={unitInset(1.44)} />
      <div className="absolute border border-black/35" style={unitInset(2.32)} />

      <PreviewHand seat="top" regionKey="topHand" />
      <PreviewHand seat="right" regionKey="rightHand" />
      <PreviewHand seat="bottom" regionKey="bottomHand" />
      <PreviewHand seat="left" regionKey="leftHand" />

      <PlayerPlate seat="top" regionKey="topPlayer" />
      <PlayerPlate seat="right" regionKey="rightPlayer" />
      <PlayerPlate seat="bottom" regionKey="bottomPlayer" />
      <PlayerPlate seat="left" regionKey="leftPlayer" />

      <RiverBlock seat="top" regionKey="topRiver" />
      <RiverBlock seat="right" regionKey="rightRiver" />
      <RiverBlock seat="bottom" regionKey="bottomRiver" />
      <RiverBlock seat="left" regionKey="leftRiver" />

      <CenterPanel />

      {editMode ? <CalibrationOverlay /> : null}
    </div>
  );
}

function RegionBox({ regionKey, children }: { regionKey: RegionKey; children: ReactNode }) {
  const region = regions[regionKey];

  return (
    <div className="absolute" style={regionStyle(region)} data-layout-region={region.label}>
      {children}
    </div>
  );
}

function PlayerPlate({ seat, regionKey }: { seat: PreviewSeat; regionKey: RegionKey }) {
  return (
    <RegionBox regionKey={regionKey}>
      <div className="flex h-full min-w-0 items-center gap-2 rounded bg-zinc-950/70 px-2 text-[11px] shadow-sm">
        <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-white/75">{seatLabels[seat]}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{playerNames[seat]}</span>
        <span className="shrink-0 tabular-nums text-white/70">{scores[seat]}</span>
      </div>
    </RegionBox>
  );
}

function PreviewHand({ seat, regionKey }: { seat: PreviewSeat; regionKey: RegionKey }) {
  const callTileCount = melds[seat].reduce((count, meld) => count + meld.length, 0);
  const handTileCount = seat === "bottom" ? Math.max(4, bottomHand.length - callTileCount) : Math.max(4, 13 - callTileCount);
  const visibleBottomHand = bottomHand.slice(0, handTileCount);

  return (
    <RegionBox regionKey={regionKey}>
      <div className="relative h-full w-full overflow-visible" data-preview-hand={seat}>
        <div
          className="relative z-20 flex h-full items-center justify-start gap-0 overflow-hidden"
          style={{ width: unit(handTileCount * 0.72) }}
        >
          {seat === "bottom"
            ? visibleBottomHand.map((tile, index) => (
                <Tile key={`${tile}-${index}`} value={tile} current={index === visibleBottomHand.length - 1} />
              ))
            : Array.from({ length: handTileCount }).map((_, index) => <TileBack key={`${seat}-back-${index}`} size="normal" />)}
        </div>
        <PreviewCalls seat={seat} />
      </div>
    </RegionBox>
  );
}

function PreviewCalls({ seat }: { seat: PreviewSeat }) {
  return (
    <div className="absolute bottom-0 right-0 z-10 flex w-0 flex-row-reverse items-end overflow-visible" data-preview-calls={seat}>
      {melds[seat].map((meld, index) => (
        <div
          key={`${seat}-meld-${index}`}
          className="flex shrink-0 gap-0 rounded bg-zinc-950/35 p-0 shadow-sm"
          style={{ zIndex: melds[seat].length - index }}
        >
          {meld.map((tile, tileIndex) => (
            <Tile key={`${tile}-${tileIndex}`} value={tile} source={tileIndex === 0} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RiverBlock({ seat, regionKey }: { seat: PreviewSeat; regionKey: RegionKey }) {
  const tiles = rivers[seat];
  const rows = chunkTiles(tiles, 6);

  return (
    <RegionBox regionKey={regionKey}>
      <div className="flex h-full w-full flex-col items-start gap-0 overflow-visible rounded bg-black/10 p-0" data-preview-river={seat}>
        {rows.map((row, rowIndex) => (
          <div key={`${seat}-river-row-${rowIndex}`} className="flex gap-0">
            {row.map(({ tile, index }) => (
              <RiverTile key={`${seat}-${tile}-${index}`} tile={tile} riichi={index === riichiDiscardIndex} current={index === tiles.length - 1} />
            ))}
          </div>
        ))}
      </div>
    </RegionBox>
  );
}

function RiverTile({ tile, riichi, current }: { tile: string; riichi: boolean; current: boolean }) {
  if (riichi) {
    return (
      <span className="grid h-9 w-12 place-items-center overflow-visible">
        <Tile value={tile} current={current} className="rotate-90" />
      </span>
    );
  }

  return <Tile value={tile} current={current} />;
}

function chunkTiles(tiles: string[], size: number) {
  const rows: Array<Array<{ tile: string; index: number }>> = [];

  for (let index = 0; index < tiles.length; index += size) {
    rows.push(tiles.slice(index, index + size).map((tile, offset) => ({ tile, index: index + offset })));
  }

  return rows;
}

function CenterPanel() {
  return (
    <RegionBox regionKey="center">
      <section className="relative grid h-full place-items-center rounded-sm border border-white/20 bg-zinc-950/70 p-2 text-center shadow-lg" data-preview-center="true">
        <span className="pointer-events-none absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-sm border border-white/20 bg-white/10 text-[11px] font-bold leading-none text-white/80"><span className="rotate-90">北</span></span>
        <span className="pointer-events-none absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-sm border border-white/20 bg-white/10 text-[11px] font-bold leading-none text-white/80"><span className="rotate-180">西</span></span>
        <span className="pointer-events-none absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-sm border border-white/20 bg-white/10 text-[11px] font-bold leading-none text-white/80"><span className="-rotate-90">南</span></span>
        <span className="pointer-events-none absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-sm border border-white/20 bg-white/10 text-[11px] font-bold leading-none text-white/80"><span>东</span></span>
        <div className="text-xs leading-5">
          <p className="font-semibold">东4局</p>
          <p className="text-white/65">0本场 / 供托1</p>
          <p className="text-white/65">余牌38</p>
        </div>
        <div className="flex gap-0">
          {doraIndicators.map((tile, index) => (
            <Tile key={`${tile}-${index}`} value={tile} />
          ))}
        </div>
      </section>
    </RegionBox>
  );
}

function CalibrationOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {Object.entries(regions).map(([key, region]) => (
        <div key={key} className="absolute border border-dashed border-sky-300/90 bg-sky-400/10" style={regionStyle(region)}>
          <div className="absolute left-0 top-0 max-w-full truncate bg-sky-300 px-1 py-0.5 text-[10px] font-semibold leading-none text-sky-950">
            {region.label} {formatUnit(region.x)},{formatUnit(region.y)} {formatUnit(region.w)}x{formatUnit(region.h)}u
            {region.rotate ? ` r${region.rotate}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function regionStyle(region: Region): CSSProperties {
  return {
    left: unit(region.x),
    top: unit(region.y),
    width: unit(region.w),
    height: unit(region.h),
    transform: region.rotate ? `rotate(${region.rotate}deg)` : undefined,
    transformOrigin: region.rotate ? "top left" : undefined,
  };
}

function unit(value: number) {
  return `calc(${value} * var(--preview-tile-unit))`;
}

function unitInset(value: number): CSSProperties {
  const inset = unit(value);

  return {
    left: inset,
    right: inset,
    top: inset,
    bottom: inset,
  };
}

function formatUnit(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
