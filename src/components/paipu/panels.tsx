"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Bot, ChevronRight, Clipboard, Clock, Info, Loader2, MessageSquareText, Send, ShieldAlert, Sparkles, Star, Trash2, Trophy, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Tile } from "@/components/paipu/tiles";
import type { TileEfficiencyAnalysis } from "@/lib/majsoul/tile-efficiency";
import type { OffensiveEvAnalysis } from "@/lib/majsoul/offensive-ev";
import { formatTileName } from "../../lib/majsoul/tile-format";
import type { AnalysisChatMessage, AnalysisEngineRecommendation, AnalysisLlmModelChoice, AnalyzeDebug, DecisionDifference, EngineOverlay, Player, Round } from "@/lib/majsoul/types";

type RoundListPanelProps = {
  rounds: Round[];
  players: Player[];
  selectedRoundId: string | null;
  onSelectRound: (roundId: string) => void;
};

type PlayersPanelProps = {
  players: Player[];
  targetSeat: 0 | 1 | 2 | 3;
  scores?: Record<0 | 1 | 2 | 3, number>;
  onSelectSeat?: (seat: 0 | 1 | 2 | 3) => void;
};

type EngineComparePanelProps = {
  difference: DecisionDifference | null;
  overlay?: EngineOverlay;
  preanalysisStats?: MortalPreanalysisStats;
};

export type MortalPreanalysisStats = {
  total: number;
  ready: number;
  loading: number;
  unavailable: number;
};

type TileEfficiencyPanelProps = {
  analysis: TileEfficiencyAnalysis;
};

type OffensiveEvPanelProps = {
  analysis: OffensiveEvAnalysis;
};

type PaipuLibraryEntry = {
  id: string;
  url: string;
  title: string;
  players: string[];
  roundCount: number;
  lastOpenedAt: number;
  favorite: boolean;
  note: string;
};

type PaipuLibraryPanelProps = {
  entries: PaipuLibraryEntry[];
  onOpen: (entry: PaipuLibraryEntry) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
};

type ScoreTrendPanelProps = {
  rounds: Round[];
  players: Player[];
  selectedRoundId: string | null;
  onSelectRound: (roundId: string) => void;
};

type AnalysisChatPanelProps = {
  messages: AnalysisChatMessage[];
  disabled: boolean;
  pending: boolean;
  model: AnalysisLlmModelChoice;
  snapshotLabel: string;
  error: string | null;
  onModelChange: (model: AnalysisLlmModelChoice) => void;
  onAsk: (question: string) => void | Promise<void>;
};

type DebugPanelProps = {
  debug: AnalyzeDebug | null;
  copied: boolean;
  onCopy: () => void | Promise<void>;
};

type MetricStripProps = {
  eventCount: number;
  targetStyle: string;
  selectedRoundScoreDelta: string;
  className?: string;
};

const windNames = ["东家", "南家", "西家", "北家"];

export function RoundListPanel({ rounds, players = [], selectedRoundId, onSelectRound }: RoundListPanelProps) {
  const scorePoints = buildScoreTrendPoints(rounds);

  return (
    <PanelShell title="对局" eyebrow={rounds.length ? `${rounds.length} 局` : "待读取"} className="overflow-hidden">
      <ScoreTrendChart points={scorePoints} players={players} selectedRoundId={selectedRoundId} onSelectRound={onSelectRound} />
      <div className="max-h-[55vh] min-w-0 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 lg:max-h-[calc(100vh-220px)]">
        {rounds.length ? (
          rounds.map((round) => {
            const isSelected = selectedRoundId === round.id;

            return (
              <button
                key={round.id}
                type="button"
                onClick={() => onSelectRound(round.id)}
                className={`w-full min-w-0 rounded-md border px-2 py-2 text-left transition ${
                  isSelected ? "border-blue-200 bg-blue-50 text-zinc-950" : "border-transparent bg-transparent hover:border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-bold">{round.title}</span>
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-blue-500" : "text-zinc-300"}`} aria-hidden="true" />
                </div>
                <p className="mt-1 truncate text-[11px] leading-5 text-zinc-500">{formatRoundOutcome(round, players)}</p>
              </button>
            );
          })
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-500">
            粘贴雀魂/天凤/一番街牌谱后，局列表会显示在这里。
          </p>
        )}
      </div>
    </PanelShell>
  );
}

function formatRoundOutcome(round: Round, players: Player[]) {
  const agari = round.events.find((event) => event.type === "agari");

  if (agari?.type === "agari") {
    const player = players.find((item) => item.seat === agari.seat);
    const name = player?.name ?? `${windNames[agari.seat] ?? agari.seat}`;
    return `${name} ${agari.zimo ? "自摸" : "荣和"}${agari.title ? ` ${agari.title}` : ""}`;
  }

  const ryukyoku = round.events.find((event) => event.type === "ryukyoku");

  if (ryukyoku?.type === "ryukyoku") {
    return ryukyoku.label;
  }

  return round.result;
}

export function PlayersPanel({ players, targetSeat, scores, onSelectSeat }: PlayersPanelProps) {
  return (
    <PanelShell title="玩家" eyebrow={`我的视角 ${windNames[targetSeat] ?? targetSeat}`} className="overflow-hidden">
      <div className="-mx-2 -my-1 min-w-0">
        {players.map((player) => {
          const isTarget = player.seat === targetSeat;

          return (
            <button
              key={player.seat}
              type="button"
              onClick={() => onSelectSeat?.(player.seat)}
              className={`flex w-full min-w-0 items-center justify-between gap-3 border-t border-zinc-100 px-2 py-2 first:border-t-0 ${
                isTarget ? "bg-emerald-50" : "bg-white"
              } text-left transition hover:bg-zinc-50`}
              aria-pressed={isTarget}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-zinc-100 text-xs font-extrabold text-zinc-800">{player.wind}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-zinc-900">{player.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">{isTarget ? "目标玩家" : "对手"}</p>
                </div>
              </div>
              <p className="shrink-0 text-xs font-extrabold tabular-nums text-zinc-900">{formatPanelScore(scores?.[player.seat], player.score)}</p>
            </button>
          );
        })}
      </div>
    </PanelShell>
  );
}

function formatPanelScore(score: number | undefined, fallback: string) {
  return typeof score === "number" && Number.isFinite(score) ? new Intl.NumberFormat("en-US").format(score) : fallback;
}

export function PaipuLibraryPanel({ entries, onOpen, onToggleFavorite, onUpdateNote, onRemove }: PaipuLibraryPanelProps) {
  const favorites = entries.filter((entry) => entry.favorite);
  const visibleEntries = favorites.length ? favorites.concat(entries.filter((entry) => !entry.favorite)).slice(0, 8) : entries.slice(0, 8);

  return (
    <PanelShell title="牌谱库" eyebrow={entries.length ? `${entries.length} 条` : "本机保存"} icon={Clock} className="overflow-hidden">
      <div className="min-w-0 space-y-1.5">
        {visibleEntries.length ? (
          visibleEntries.map((entry) => (
            <div key={entry.id} className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <div className="flex min-w-0 items-start gap-2">
                <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-xs font-bold text-zinc-900">{entry.title}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {entry.roundCount} 局 / {entry.players.slice(0, 2).join("、") || entry.id}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(entry.id)}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border transition ${
                    entry.favorite ? "border-amber-300 bg-amber-50 text-amber-600" : "border-zinc-200 bg-white text-zinc-500 hover:text-amber-600"
                  }`}
                  aria-label={entry.favorite ? "取消收藏" : "收藏"}
                  title={entry.favorite ? "取消收藏" : "收藏"}
                >
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-200 hover:text-rose-600"
                  aria-label="删除记录"
                  title="删除记录"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <input
                value={entry.note}
                onChange={(event) => onUpdateNote(entry.id, event.target.value)}
                className="mt-2 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs outline-none transition placeholder:text-zinc-400 focus:border-emerald-500"
                placeholder="备注"
              />
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-500">导入成功后会自动保存到这里。</p>
        )}
      </div>
    </PanelShell>
  );
}

export function ScoreTrendPanel({ rounds, players, selectedRoundId, onSelectRound }: ScoreTrendPanelProps) {
  const points = buildScoreTrendPoints(rounds);

  return (
    <PanelShell title="分数走势" eyebrow={rounds.length ? `${rounds.length} 局` : "待读取"} className="overflow-hidden">
      {points.length ? (
        <div className="min-w-0 space-y-3">
          <ScoreTrendChart points={points} players={players} selectedRoundId={selectedRoundId} onSelectRound={onSelectRound} />
          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {points.map((point) => (
              <button
                key={point.round.id}
                type="button"
                onClick={() => onSelectRound(point.round.id)}
                className={`w-full rounded border px-2 py-1.5 text-left text-xs transition ${
                  selectedRoundId === point.round.id ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                <span className="block truncate font-semibold">{point.round.title}</span>
                <span className={`mt-0.5 block truncate ${selectedRoundId === point.round.id ? "text-zinc-300" : "text-zinc-500"}`}>{formatRoundOutcome(point.round, players)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-500">读取牌谱后显示四家分数变化。</p>
      )}
    </PanelShell>
  );
}

function ScoreTrendChart({
  points,
  players,
  selectedRoundId,
  onSelectRound,
}: {
  points: ReturnType<typeof buildScoreTrendPoints>;
  players: Player[];
  selectedRoundId: string | null;
  onSelectRound: (roundId: string) => void;
}) {
  if (!points.length) {
    return null;
  }

  const minScore = Math.min(...points.flatMap((point) => point.scores), 0);
  const maxScore = Math.max(...points.flatMap((point) => point.scores), 50000);
  const span = Math.max(1, maxScore - minScore);
  const width = 280;
  const height = 150;
  const padding = { top: 14, right: 16, bottom: 30, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xAt = (index: number) => (points.length <= 1 ? padding.left + plotWidth / 2 : padding.left + (index / (points.length - 1)) * plotWidth);
  const yAt = (score: number) => padding.top + plotHeight - ((score - minScore) / span) * plotHeight;
  const yTicks = [maxScore, Math.round((maxScore + minScore) / 2), minScore];
  const xTickIndexes = points.length <= 4 ? points.map((_, index) => index) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const colors = ["#059669", "#2563eb", "#dc2626", "#7c3aed"];

  return (
    <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="四家分数折线图，x轴为局数，y轴为分数">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#d4d4d8" strokeWidth="1" />
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#d4d4d8" strokeWidth="1" />
        <text x={padding.left - 30} y={padding.top + 4} fill="#71717a" fontSize="10">
          分数
        </text>
        <text x={width - padding.right - 18} y={height - 6} fill="#71717a" fontSize="10">
          局数
        </text>
        {yTicks.map((score) => (
          <g key={score}>
            <line x1={padding.left - 3} y1={yAt(score)} x2={width - padding.right} y2={yAt(score)} stroke="#e4e4e7" strokeWidth="1" />
            <text x={padding.left - 6} y={yAt(score) + 3} textAnchor="end" fill="#71717a" fontSize="9">
              {formatCompactScore(score)}
            </text>
          </g>
        ))}
        {xTickIndexes.map((index) => (
          <g key={index}>
            <line x1={xAt(index)} y1={height - padding.bottom} x2={xAt(index)} y2={height - padding.bottom + 3} stroke="#a1a1aa" strokeWidth="1" />
            <text x={xAt(index)} y={height - padding.bottom + 14} textAnchor="middle" fill="#71717a" fontSize="9">
              {index + 1}局
            </text>
          </g>
        ))}
        {players.map((player, playerIndex) => {
          const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.scores[player.seat] ?? player.startScore)}`).join(" ");
          return <path key={player.seat} d={path} fill="none" stroke={colors[playerIndex] ?? "#52525b"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />;
        })}
        {points.map((point, index) =>
          players.map((player, playerIndex) => (
            <circle
              key={`${point.round.id}-${player.seat}`}
              cx={xAt(index)}
              cy={yAt(point.scores[player.seat] ?? player.startScore)}
              r={selectedRoundId === point.round.id ? 4 : 3}
              fill={colors[playerIndex] ?? "#52525b"}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${point.round.title} ${player.name}`}
              onClick={() => onSelectRound(point.round.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectRound(point.round.id);
                }
              }}
            />
          )),
        )}
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {players.map((player, index) => (
          <div key={player.seat} className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-600">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index] ?? "#52525b" }} />
            <span className="truncate">{player.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCompactScore(score: number) {
  return `${Math.round(score / 1000)}k`;
}

function buildScoreTrendPoints(rounds: Round[]) {
  return rounds.map((round) => ({
    round,
    scores: round.endScores?.length ? round.endScores : round.startScores,
  }));
}

function formatPreanalysisStatus(stats: MortalPreanalysisStats | undefined) {
  if (!stats?.total) {
    return "局面  -";
  }

  if (stats.ready + stats.unavailable >= stats.total) {
    return `已缓存 ${stats.ready}/${stats.total}`;
  }

  return stats.loading ? `已缓存 ${stats.ready}/${stats.total} · ${stats.loading} 计算中` : `已缓存 ${stats.ready}/${stats.total}`;
}

function formatPreanalysisTitle(stats: MortalPreanalysisStats | undefined) {
  if (!stats?.total) {
    return "当前视角暂无需要 Mortal 预分析的自家决策点。";
  }

  const pending = Math.max(0, stats.total - stats.ready - stats.loading - stats.unavailable);
  return `Mortal 缓存：完成 ${stats.ready}，计算中 ${stats.loading}，未计算 ${pending}，失败 ${stats.unavailable}，共 ${stats.total}`;
}

export function EngineComparePanel({ difference, overlay, preanalysisStats }: EngineComparePanelProps) {
  const topRecommendation = difference?.topRecommendation ?? overlay?.topRecommendation ?? overlay?.recommendations[0];
  const actualLabel = difference ? formatEngineAction(difference.point.actualAction, difference.point.actualTile ?? difference.point.reactionTile) : "等待决策";
  const topLabel = topRecommendation ? formatEngineRecommendationLabel(topRecommendation) : overlay?.status === "loading" ? "计算中" : "等待推荐";
  const actualRank = difference && overlay?.recommendations ? findActualRank(difference, overlay.recommendations) : null;
  const statusLabel = overlay?.status === "loading" ? "Mortal 计算中" : difference ? formatDifferenceStatus(difference.status) : formatPreanalysisStatus(preanalysisStats);

  return (
    <PanelShell
      title="实际动作 vs Mortal 推荐"
      className="border-zinc-300"
      bodyClassName="p-0"
      action={
        <span className="shrink-0 truncate font-mono text-[11px] text-zinc-500" title={formatPreanalysisTitle(preanalysisStats)}>
          {statusLabel}
        </span>
      }
    >
      <div className="grid min-w-0 grid-cols-2">
        <DecisionCompareSide
          tone="actual"
          label="实际动作"
          action={actualLabel}
          rows={[
            ["差异状态", difference ? formatDifferenceStatus(difference.status) : "未定位"],
            ["候选排名", actualRank ? `#${actualRank}` : "-"],
            ["事件", difference ? `#${difference.point.actualEventCursor}` : "-"],
          ]}
          reason={formatActualReason(difference)}
        />
        <DecisionCompareSide
          tone="mortal"
          label="Mortal 推荐"
          action={topLabel}
          rows={[
            ["Top%", formatProbability(topRecommendation?.probability)],
            ["候选排名", topRecommendation ? `#${topRecommendation.rank}` : "-"],
            ["评分", formatScore(topRecommendation?.score)],
          ]}
          reason={formatRecommendationReason(topRecommendation, overlay)}
        />
      </div>
      {overlay?.recommendations.length ? (
        <div className="border-t border-zinc-200">
          {overlay.recommendations.slice(0, 5).map((recommendation) => (
            <div key={`${recommendation.rank}-${recommendation.action}-${recommendation.tile ?? "none"}`} className="grid min-w-0 grid-cols-[2rem_1fr_auto] items-center gap-2 border-t border-zinc-100 px-2.5 py-2 first:border-t-0">
              <span className="font-mono text-xs font-extrabold text-zinc-400">{String(recommendation.rank).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-zinc-900">{formatEngineRecommendationLabel(recommendation)}</p>
                <p className="truncate text-[11px] text-zinc-500">{recommendation.tags.join(" · ") || "Mortal 候选"}</p>
              </div>
              <strong className="font-mono text-xs text-zinc-900">{formatProbability(recommendation.probability)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </PanelShell>
  );
}

export function TileEfficiencyPanel({ analysis }: TileEfficiencyPanelProps) {
  const bestOptions = analysis.discardOptions.slice(0, 4);
  const waitCount = analysis.waits.reduce((sum, wait) => sum + wait.remaining, 0);
  const bestOption = bestOptions[0];
  const helpText = bestOption
    ? `先看第一行。切 ${formatTileName(bestOption.discard)} 后为${formatShanten(bestOption.shantenAfterDiscard)}，理论 ${bestOption.theoreticalWaitCount} 枚，已见 ${bestOption.visibleWaitCount} 枚，剩余 ${bestOption.waitCount} 枚。`
    : `当前${formatShanten(analysis.shanten)}，理论 ${analysis.theoreticalWaitCount} 枚，已见 ${analysis.visibleWaitCount} 枚，剩余 ${waitCount} 枚。`;

  return (
    <PanelShell
      title="牌效分析"
      eyebrow={analysis.status === "ready" ? formatShanten(analysis.shanten) : "待计算"}
      icon={Sparkles}
      action={analysis.status === "ready" ? <InfoTooltip text={helpText} /> : null}
      className="overflow-hidden"
    >
      {analysis.status === "ready" ? (
        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <EfficiencyStat label="当前向听" value={formatShanten(analysis.shanten)} />
            <EfficiencyStat label="一般形" value={formatShanten(analysis.standardShanten)} />
            <EfficiencyStat label="剩余受入" value={`${bestOption?.waitCount ?? waitCount} 枚`} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <EfficiencyStat label="理论" value={`${bestOption?.theoreticalWaitCount ?? analysis.theoreticalWaitCount} 枚`} />
            <EfficiencyStat label="已见扣除" value={`${bestOption?.visibleWaitCount ?? analysis.visibleWaitCount} 枚`} />
            <EfficiencyStat label="剩余" value={`${bestOption?.waitCount ?? waitCount} 枚`} />
          </div>

          {bestOptions.length ? (
            <div className="min-w-0 overflow-hidden rounded-md border border-zinc-200">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
                <span className="text-xs font-bold text-zinc-800">打牌候选</span>
                <span className="text-[11px] text-zinc-500">按向听数、受入枚数排序</span>
              </div>
              {bestOptions.map((option, index) => (
                <div key={option.discard} className={`grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-t border-zinc-100 px-2 py-2 first:border-t-0 ${index === 0 ? "bg-emerald-50/70" : ""}`}>
                  <span className="font-mono text-[11px] font-extrabold text-zinc-400">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-xs font-bold text-zinc-500">切</span>
                      <Tile value={option.discard} size="compact" flat />
                      <span className="truncate text-xs font-bold text-zinc-900">{formatShanten(option.shantenAfterDiscard)}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">有效牌：{formatWaitPreview(option.waits)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">理论 {option.theoreticalWaitCount} · 已见 {option.visibleWaitCount} · 剩余 {option.waitCount}</p>
                  </div>
                  <div className="text-right">
                    <strong className="block font-mono text-xs text-zinc-950">{option.waitCount}</strong>
                    <span className="text-[10px] text-zinc-500">枚</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <WaitList waits={analysis.waits} total={waitCount} />
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-500">{analysis.message}</p>
      )}
    </PanelShell>
  );
}

export function OffensiveEvPanel({ analysis }: OffensiveEvPanelProps) {
  const bestOptions = analysis.options.filter((option) => option.shantenAfterDiscard <= 1).slice(0, 3);
  const routeOptions = analysis.options.filter((option) => option.shantenAfterDiscard > 1).slice(0, 3);
  const bestOption = bestOptions[0];
  const helpText = bestOption
    ? `实验性进攻EV 只比较听牌和一向听候选。切 ${formatTileName(bestOption.discard)} 后 EV ${bestOption.offensiveEv}，预计打点 ${bestOption.averageScore}，进张 ${bestOption.ukeire} 枚。`
    : "二向听以上只显示路线参考，不按 EV 决策。";

  return (
    <PanelShell
      title="实验性进攻EV"
      eyebrow={analysis.status === "ready" ? "实验" : "待计算"}
      icon={Trophy}
      action={analysis.status === "ready" ? <InfoTooltip text={helpText} /> : null}
      className="overflow-hidden"
    >
      {analysis.status === "ready" ? (
        <div className="min-w-0 space-y-2">
          {bestOptions.length ? (
            <div className="min-w-0 overflow-hidden rounded-md border border-zinc-200">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
                <span className="text-xs font-bold text-zinc-800">EV 候选</span>
                <span className="text-[11px] text-zinc-500">仅听牌 / 一向听</span>
              </div>
              {bestOptions.map((option, index) => (
                <div key={option.discard} className={`grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-t border-zinc-100 px-2 py-2 first:border-t-0 ${index === 0 ? "bg-emerald-50/70" : ""}`}>
                  <span className="font-mono text-[11px] font-extrabold text-zinc-400">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-xs font-bold text-zinc-500">切</span>
                      <Tile value={option.discard} size="compact" flat />
                      <span className="truncate text-xs font-bold text-zinc-900">EV {option.offensiveEv}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">
                      预计打点 {option.averageScore} · 进张 {option.ukeire}
                      {option.furitenWaits.length ? ` 路 振听 ${option.furitenWaits.join("、")}` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">未来听牌规模 {option.waitCount} · 向听 {option.shantenAfterDiscard}</p>
                  </div>
                  <div className="text-right">
                    <strong className="block font-mono text-xs text-zinc-950">{option.offensiveEv}</strong>
                    <span className="text-[10px] text-zinc-500">EV</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-500">当前还没有听牌或一向听候选，暂不做 EV 排序。</p>
          )}
          {routeOptions.length ? (
            <div className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-800">远手路线参考</span>
                <span className="text-[11px] text-zinc-500">不参与 EV 排序</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {routeOptions.map((option) => (
                  <div key={`route-${option.discard}`} className="flex min-w-0 items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-xs font-bold text-zinc-500">切</span>
                      <Tile value={option.discard} size="compact" flat />
                      <span className="truncate text-xs text-zinc-600">{option.shantenAfterDiscard}向听 · 未来听牌规模 {option.ukeire}</span>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-zinc-500">参考 {option.offensiveEv}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-500">{analysis.message ?? "实验性进攻EV 暂不可用。"}</p>
      )}
    </PanelShell>
  );
}

export function AnalysisChatPanel({ messages, disabled, pending, model, snapshotLabel, error, onModelChange, onAsk }: AnalysisChatPanelProps) {
  return (
    <PanelShell title="AI 复盘聊天" eyebrow={snapshotLabel} icon={MessageSquareText} className="overflow-hidden">
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="shrink-0 text-xs font-medium text-zinc-500">LLM 模型</span>
          <div className="grid h-9 grid-cols-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
            {(["flash", "pro"] as AnalysisLlmModelChoice[]).map((item) => (
              <button
                key={item}
                type="button"
                disabled={pending}
                onClick={() => onModelChange(item)}
                className={`min-w-16 rounded-md px-3 text-xs font-semibold transition ${
                  model === item ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:bg-white disabled:hover:bg-transparent"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {item === "flash" ? "Flash" : "Pro"}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-64 max-h-[420px] min-w-0 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          {messages.length ? (
            <>
              {messages.map((message) => (
              <div key={message.id} className={`flex min-w-0 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[92%] whitespace-pre-line break-words rounded-lg px-3 py-2 text-sm leading-6 ${
                    message.role === "user" ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-700"
                  }`}
                >
                  {message.role === "assistant" && message.structured ? <StructuredAnalysisMessage structured={message.structured} pending={pending} onAsk={onAsk} /> : message.content}
                </div>
              </div>
              ))}
              {pending ? <PendingAnalysisMessage /> : null}
            </>
          ) : pending ? (
            <PendingAnalysisMessage />
          ) : (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <Bot className="mx-auto h-8 w-8 text-zinc-400" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-zinc-700">停在任意事件点提问</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">可以问攻守、危险牌、手役、牌效或整局复盘重点。</p>
              </div>
            </div>
          )}
        </div>

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">{error}</p> : null}

        <form
          className="min-w-0 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const question = String(new FormData(form).get("question") ?? "").trim();

            if (!question) {
              return;
            }

            void onAsk(question);
            form.reset();
          }}
        >
          <textarea
            name="question"
            rows={3}
            disabled={disabled || pending}
            className="min-h-24 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
            placeholder={disabled ? "先读取牌谱后再提问" : "例如：这一巡该押吗？我这局主要问题是什么？"}
          />
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 break-words text-xs leading-5 text-zinc-500">
              {model === "flash" ? "Flash 更适合快速复盘。" : "Pro 更适合长问题和整局总结。"}
            </p>
            <button
              type="submit"
              disabled={disabled || pending}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              发送
            </button>
          </div>
        </form>
      </div>
    </PanelShell>
  );
}

function StructuredAnalysisMessage({
  structured,
  pending,
  onAsk,
}: {
  structured: NonNullable<AnalysisChatMessage["structured"]>;
  pending: boolean;
  onAsk: (question: string) => void | Promise<void>;
}) {
  const chips = [...new Set([...(structured.suggestedQuestions ?? []), ...(structured.directReplies ?? [])])].filter((item) => item.trim().length > 0);
  const hasMore = Boolean(structured.risks.length || structured.evidence.length);

  return (
    <div className="space-y-3 whitespace-normal">
      <AnalysisMessageList title="纠正" items={structured.correctionsAccepted ?? []} />
      <p className="text-sm font-semibold leading-6 text-zinc-900">{structured.conclusion}</p>
      <AnalysisMessageList title="理由" items={structured.reasons} />
      {hasMore ? (
        <details className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-zinc-500">更多</summary>
          <div className="mt-2 space-y-3">
            <AnalysisMessageList title="风险" items={structured.risks} />
            <AnalysisMessageList title="依据" items={structured.evidence} />
          </div>
        </details>
      ) : null}
      {chips.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
          <p className="basis-full text-[11px] font-semibold text-zinc-500">可追问</p>
          {chips.map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={pending}
              onClick={() => void onAsk(reply)}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PendingAnalysisMessage() {
  const [dots, setDots] = useState("。");

  useEffect(() => {
    const states = ["。", "。。", "。。。"];
    let index = 0;

    const timer = window.setInterval(() => {
      index = (index + 1) % states.length;
      setDots(states[index]);
    }, 550);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex min-w-0 justify-start">
      <div className="max-w-[92%] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-700">
        <p className="font-medium text-zinc-900" aria-live="polite">
          AI 思考中{dots}
        </p>
      </div>
    </div>
  );
}

function AnalysisMessageList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-zinc-500">{title}</p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="break-words text-sm leading-6 text-zinc-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MetricStrip({ eventCount, targetStyle, selectedRoundScoreDelta, className = "" }: MetricStripProps) {
  return (
    <div className={`grid min-w-0 gap-4 md:grid-cols-3 xl:grid-cols-1 ${className}`}>
      <Metric icon={UsersRound} label="事件数" value={String(eventCount)} />
      <Metric icon={Trophy} label="目标点差" value={targetStyle} />
      <Metric icon={ShieldAlert} label="当前局结果" value={selectedRoundScoreDelta} />
    </div>
  );
}

export function DebugPanel({ debug, copied, onCopy }: DebugPanelProps) {
  const failedStage = debug?.stages.find((stage) => stage.status === "error");
  const latestStage = failedStage ?? debug?.stages.at(-1);
  const recordCounts = debug?.recordCounts ? Object.entries(debug.recordCounts).slice(0, 8) : [];

  return (
    <details className="group min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900">开发调试</h2>
            <p className="break-words text-sm text-zinc-500">
              ?debug=1 已开启，当前阶段：{latestStage ? `${latestStage.name} / ${latestStage.status}` : "等待请求"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="w-fit rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500">{debug ? `${debug.durationMs} ms` : "无数据"}</span>
            <ChevronRight className="h-4 w-4 text-zinc-400 transition group-open:rotate-90" aria-hidden="true" />
          </div>
        </div>
      </summary>

      <div className="mt-4 min-w-0 space-y-4">
        <button
          type="button"
          onClick={onCopy}
          disabled={!debug}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300"
        >
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          {copied ? "已复制" : "复制诊断"}
        </button>

        {debug ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <DebugStat label="阶段" value={latestStage ? `${latestStage.name} / ${latestStage.status}` : "无"} />
              <DebugStat label="耗时" value={`${debug.durationMs} ms`} />
              <DebugStat label="牌谱" value={debug.source?.id ?? "-"} />
              <DebugStat label="来源" value={debug.recordSource ?? "-"} />
            </div>

            {debug.error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {debug.error.code}: {debug.error.message}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <DebugSection title="解析摘要">
                <p>局数：{debug.normalize?.rounds ?? 0}</p>
                <p>事件：{debug.normalize?.eventCount ?? 0}</p>
                <p>记录：{debug.recordsTotal ?? 0}</p>
                <p>不支持原因：{debug.normalize?.unsupportedReason ?? "-"}</p>
              </DebugSection>
              <DebugSection title="玩家摘要">
                {(debug.players ?? []).map((player) => (
                  <p key={`${player.seat}-${player.nickname}`} className="break-words">
                    seat {player.seat}: {player.nickname || "-"}
                  </p>
                ))}
                {!debug.players?.length ? <p>-</p> : null}
              </DebugSection>
            </div>

            <DebugSection title="网络尝试">
              <p>代理：{debug.network?.proxy === "configured" ? "已配置" : "未配置"}</p>
              <div className="mt-2 space-y-2">
                {(debug.network?.attempts ?? []).map((attempt) => (
                  <div key={`${attempt.gatewayUrl}-${attempt.durationMs}`} className="rounded border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-600">
                    <p className="break-all font-medium">{attempt.gatewayUrl}</p>
                    <p className="break-words">
                      {attempt.status} / {attempt.durationMs} ms{attempt.message ? ` / ${attempt.message}` : ""}
                    </p>
                  </div>
                ))}
                {!debug.network?.attempts.length ? <p className="text-sm text-zinc-500">暂无网络尝试</p> : null}
              </div>
            </DebugSection>

            <DebugSection title="Record 类型">
              <div className="flex flex-wrap gap-2">
                {recordCounts.map(([name, count]) => (
                  <span key={name} className="max-w-full break-all rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600">
                    {name}: {count}
                  </span>
                ))}
                {!recordCounts.length ? <span className="text-sm text-zinc-500">暂无记录</span> : null}
              </div>
            </DebugSection>

            <DebugSection title="宝牌变化">
              <div className="space-y-2">
                {(debug.normalize?.doraChanges ?? []).map((change) => (
                  <div key={`${change.roundId}-${change.eventIndex}-${change.record}`} className="rounded border border-zinc-200 bg-white px-2 py-2 text-xs">
                    <p className="font-medium text-zinc-700">
                      {change.roundTitle} / #{change.eventIndex} / {change.record} / {change.source}
                    </p>
                    <p className="mt-1 break-words text-zinc-600">{change.doraIndicators.map(formatTileName).join(" ") || "-"}</p>
                  </div>
                ))}
                {!debug.normalize?.doraChanges?.length ? <p className="text-sm text-zinc-500">暂无宝牌变化</p> : null}
              </div>
            </DebugSection>

            <DebugSection title="牌山摘要">
              <div className="space-y-2">
                {(debug.normalize?.walls ?? []).map((wall) => (
                  <div key={wall.roundId} className="rounded border border-zinc-200 bg-white px-2 py-2 text-xs">
                    <p className="font-medium text-zinc-700">{wall.roundTitle}</p>
                    <p className="mt-1 text-zinc-600">
                      {wall.source} / {wall.tileCount} 张 / raw {wall.rawLength} / {wall.complete ? "完整解析" : "部分解析"} / md5 {wall.hasMd5 ? "有" : "无"}
                    </p>
                  </div>
                ))}
                {!debug.normalize?.walls?.length ? <p className="text-sm text-zinc-500">暂无牌山字段</p> : null}
              </div>
            </DebugSection>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
            发起一次牌谱读取后，这里会显示登录、拉取、解析和规范化状态。
          </p>
        )}
      </div>
    </details>
  );
}

function PanelShell({
  title,
  eyebrow,
  icon: Icon,
  action,
  className = "",
  bodyClassName = "p-2",
  children,
}: {
  title: string;
  eyebrow?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const panelBodyId = `panel-${title.replace(/\s+/g, "-").toLowerCase()}-body`;

  return (
    <section className={`min-w-0 overflow-hidden rounded-[10px] border border-zinc-200 bg-white ${className}`}>
      <div className={`flex h-9 min-w-0 items-center justify-between gap-2 px-2.5 ${isCollapsed ? "" : "border-b border-zinc-200"}`}>
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" /> : null}
          <h2 className="truncate text-sm font-extrabold text-zinc-900">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          {eyebrow ? <span className="max-w-24 truncate text-[11px] font-medium text-zinc-500">{eyebrow}</span> : null}
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 outline-none transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:bg-zinc-100 focus-visible:text-zinc-900"
            aria-expanded={!isCollapsed}
            aria-controls={panelBodyId}
            aria-label={isCollapsed ? `展开${title}` : `折叠${title}`}
            title={isCollapsed ? "展开" : "折叠"}
          >
            <ChevronRight className={`h-4 w-4 transition ${isCollapsed ? "" : "rotate-90"}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      {isCollapsed ? null : (
        <div id={panelBodyId} className={`min-w-0 ${bodyClassName}`}>
          {children}
        </div>
      )}
    </section>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="grid h-5 w-5 place-items-center rounded-md text-zinc-400 outline-none transition hover:bg-zinc-100 hover:text-blue-700 focus-visible:bg-zinc-100 focus-visible:text-blue-700"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="pointer-events-none absolute right-0 top-6 z-50 hidden w-56 rounded-md border border-zinc-200 bg-zinc-950 px-2.5 py-2 text-xs leading-5 text-white shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

function DecisionCompareSide({
  tone,
  label,
  action,
  rows,
  reason,
}: {
  tone: "actual" | "mortal";
  label: string;
  action: string;
  rows: Array<[string, string]>;
  reason: string;
}) {
  const isActual = tone === "actual";

  return (
    <div className={`min-w-0 border-r border-zinc-200 p-3 last:border-r-0 ${isActual ? "bg-rose-50/65" : "bg-emerald-50/70"}`}>
      <p className="text-[11px] font-extrabold text-zinc-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-black tracking-tight ${isActual ? "text-rose-800" : "text-emerald-800"}`}>{action}</p>
      <div className="mt-3 space-y-1.5">
        {rows.map(([rowLabel, value]) => (
          <div key={rowLabel} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
            <span className="text-zinc-500">{rowLabel}</span>
            <strong className="font-mono text-zinc-900">{value}</strong>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-black/10 pt-2 text-xs leading-5 text-zinc-700">{reason}</p>
    </div>
  );
}

function findActualRank(difference: DecisionDifference, recommendations: AnalysisEngineRecommendation[]) {
  const actualTile = difference.point.actualTile ?? difference.point.reactionTile;
  return (
    recommendations.find((recommendation) => recommendation.action === difference.point.actualAction && (recommendation.tile ?? undefined) === (actualTile ?? undefined))?.rank ?? null
  );
}

function formatDifferenceStatus(status: DecisionDifference["status"]) {
  const labels: Record<DecisionDifference["status"], string> = {
    pending: "待计算",
    same: "一致",
    different: "差异",
    "engine-unavailable": "引擎不可用",
    "not-comparable": "不可比较",
  };

  return labels[status];
}

function formatActualReason(difference: DecisionDifference | null) {
  if (!difference) {
    return "停到可比较的自家决策点后，这里会显示实际动作。";
  }

  if (difference.status === "different") {
    return "当前自家动作与 Mortal 第一候选不同，适合作为重点复盘点。";
  }

  if (difference.status === "same") {
    return "当前自家动作与 Mortal 第一候选一致，可继续扫下一个差异点。";
  }

  if (difference.status === "pending") {
    return "Mortal 正在计算当前局面的候选动作。";
  }

  return difference.reason ?? "当前事件暂时无法和 Mortal 候选做稳定比较。";
}

function formatRecommendationReason(recommendation: AnalysisEngineRecommendation | undefined, overlay: EngineOverlay | undefined) {
  if (overlay?.status === "loading") {
    return "候选动作正在计算中。";
  }

  if (overlay?.status === "unavailable") {
    return overlay.warnings[0] ?? "Mortal 暂不可用，稍后可重试。";
  }

  if (!recommendation) {
    return "停到可比较决策点后，这里会显示 Mortal 第一候选。";
  }

  return recommendation.tags.length ? recommendation.tags.join(" · ") : "Mortal 当前局面的第一候选动作。";
}

function formatEngineRecommendationLabel(recommendation: AnalysisEngineRecommendation) {
  return formatEngineAction(recommendation.action, recommendation.tile, recommendation.displayLabel);
}

function formatEngineAction(action: AnalysisEngineRecommendation["action"], tile?: string, displayLabel?: string) {
  const labels: Record<AnalysisEngineRecommendation["action"], string> = {
    discard: "切",
    riichi: "立直",
    pass: "跳过",
    chi: "吃",
    pon: "碰",
    kan: "杠",
    win: "和",
  };

  return `${displayLabel ?? labels[action]}${tile ? ` ${formatTileName(tile)}` : ""}`;
}

function formatProbability(probability: number | undefined) {
  return typeof probability === "number" && Number.isFinite(probability) ? `${Math.round(probability * 100)}%` : "-";
}

function formatScore(score: number | undefined) {
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(2) : "-";
}

function EfficiencyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5">
      <p className="truncate text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate font-mono text-sm font-extrabold text-zinc-900">{value}</p>
    </div>
  );
}

function WaitList({ waits, total }: { waits: TileEfficiencyAnalysis["waits"]; total: number }) {
  if (!waits.length) {
    return <p className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs leading-5 text-zinc-500">当前没有可展示的有效牌。</p>;
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-emerald-900">剩余有效牌</span>
        <strong className="font-mono text-xs text-emerald-900">{total} 枚</strong>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {waits.slice(0, 12).map((wait) => (
          <span key={wait.tile} className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-1.5 py-1 text-[11px] font-bold text-zinc-800">
            <Tile value={wait.tile} size="compact" flat className="!h-7 !w-5 text-[10px]" />
            {wait.remaining}/{wait.theoretical}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatWaitPreview(waits: TileEfficiencyAnalysis["waits"]) {
  if (!waits.length) {
    return "无直接受入";
  }

  return waits
    .slice(0, 6)
    .map((wait) => `${formatTileName(wait.tile)} ${wait.remaining}/${wait.theoretical}`)
    .join(" / ");
}

function formatShanten(shanten: number) {
  if (shanten === -1) {
    return "和牌";
  }
  if (shanten === 0) {
    return "听牌";
  }
  if (shanten < -1) {
    return "-";
  }

  return `${shanten} 向听`;
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function DebugSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-zinc-700">{title}</h3>
      <div className="min-w-0 space-y-1 break-words text-sm text-zinc-600">{children}</div>
    </div>
  );
}

function DebugStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold text-zinc-800">{value}</p>
    </div>
  );
}
