"use client";

import type { ReactNode } from "react";
import { Pause, Play, RotateCcw, StepBack, StepForward } from "lucide-react";

import { eventProgressLabel, eventSeatLabel, eventTypeLabel, formatRoundEvent } from "./event-format";
import type { PlaybackState } from "@/lib/majsoul/playback";
import type { DecisionDifferenceStatus, Player, RoundEvent } from "@/lib/majsoul/types";

export type PlaybackControlsProps = {
  cursor: number;
  maxCursor: number;
  isPlaying: boolean;
  disabled?: boolean;
  className?: string;
  onCursorChange: (cursor: number) => void;
  onStepPrevious: () => void;
  onStepNext: () => void;
  onReset: () => void;
  onTogglePlay: () => void;
  onPreviousDifference?: () => void;
  onNextDifference?: () => void;
  differencePending?: boolean;
  differenceDisabled?: boolean;
  differenceLabel?: string;
};

export function PlaybackControls({
  cursor,
  maxCursor,
  isPlaying,
  disabled = false,
  className = "",
  onCursorChange,
  onStepPrevious,
  onStepNext,
  onReset,
  onTogglePlay,
  onPreviousDifference,
  onNextDifference,
  differencePending = false,
  differenceDisabled = false,
  differenceLabel,
}: PlaybackControlsProps) {
  const safeCursor = clampCursor(cursor, maxCursor);
  const atStart = safeCursor <= 0;
  const atEnd = safeCursor >= maxCursor;
  const controlsDisabled = disabled || maxCursor <= 0;
  const progressLabel = eventProgressLabel(safeCursor, maxCursor);
  const rangeValueText = atStart ? progressLabel : `第 ${progressLabel} 事件`;

  return (
    <div className={`min-w-0 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="上一事件" disabled={controlsDisabled || atStart} onClick={onStepPrevious}>
          <StepBack className="h-4 w-4" />
        </IconButton>
        <IconButton label="播放/暂停" title={isPlaying ? "暂停" : "播放"} disabled={controlsDisabled || atEnd} onClick={onTogglePlay}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </IconButton>
        <IconButton label="下一事件" disabled={controlsDisabled || atEnd} onClick={onStepNext}>
          <StepForward className="h-4 w-4" />
        </IconButton>
        <IconButton label="重置到起手" disabled={controlsDisabled || atStart} onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <span className="ml-0 min-w-24 rounded border border-white/15 bg-white/10 px-2 py-1 text-center text-xs font-medium tabular-nums text-white/85 sm:ml-auto">
          {progressLabel}
        </span>
      </div>

      {onPreviousDifference || onNextDifference ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPreviousDifference}
            disabled={controlsDisabled || differenceDisabled || differencePending || !onPreviousDifference}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-lime-200/20 bg-lime-300/10 px-2.5 text-xs font-semibold text-lime-50 transition hover:bg-lime-300/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <StepBack className="h-3.5 w-3.5" aria-hidden="true" />
            上一差异
          </button>
          <button
            type="button"
            onClick={onNextDifference}
            disabled={controlsDisabled || differenceDisabled || differencePending || !onNextDifference}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-lime-200/20 bg-lime-300/10 px-2.5 text-xs font-semibold text-lime-50 transition hover:bg-lime-300/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一差异
            <StepForward className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="min-w-0 text-xs text-white/60">
            {differencePending ? "正在查找差异..." : differenceLabel ?? "比较自家操作与 Mortal 第一候选"}
          </span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <input
          type="range"
          min={0}
          max={maxCursor}
          value={safeCursor}
          onChange={(event) => onCursorChange(Number(event.target.value))}
          className="w-full cursor-pointer accent-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={controlsDisabled}
          aria-label="事件进度"
          aria-valuetext={rangeValueText}
        />
        <div className="flex items-center justify-between gap-3 text-[11px] text-white/60">
          <span>起手</span>
          <span className="truncate text-right">{atEnd && maxCursor > 0 ? "已到末尾" : maxCursor > 0 ? "拖动定位事件" : "待读取事件"}</span>
        </div>
      </div>
    </div>
  );
}

export type CurrentEventCardProps = {
  playback: PlaybackState | null;
  events: RoundEvent[];
  players: Player[];
  title?: string;
  subtitle?: string;
  className?: string;
};

export function CurrentEventCard({ playback, events, players, title = "牌谱", subtitle, className = "" }: CurrentEventCardProps) {
  const cursor = playback?.cursor ?? 0;
  const maxCursor = playback?.maxCursor ?? events.length;
  const currentEvent = playback?.currentEvent;
  const progressLabel = eventProgressLabel(cursor, maxCursor);
  const eventText = currentEvent ? formatRoundEvent(currentEvent, players) : "起手状态：已展示初始手牌，推进后会显示第一条真实事件。";

  return (
    <div className={`min-w-0 rounded-lg border border-white/25 bg-black/20 p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold">{title}</p>
          <p className="mt-1 text-sm text-white/70">{subtitle ?? progressLabel}</p>
        </div>
        <span className="max-w-[48%] shrink-0 truncate rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/80">
          {currentEvent ? eventSeatLabel(currentEvent, players) : "起手"}
        </span>
      </div>

      <div className="mt-4 min-w-0 rounded border border-white/15 bg-white/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className={`rounded px-2.5 py-1 text-xs font-semibold ring-1 ${eventTypePillClass(currentEvent)}`}>{eventTypeLabel(currentEvent)}</span>
          <span className="shrink-0 text-xs font-medium tabular-nums text-white/70">{progressLabel}</span>
        </div>
        <p className="min-h-7 min-w-0 break-words text-base font-semibold leading-7 text-white">{eventText}</p>
      </div>
    </div>
  );
}

export type EventTimelineProps = {
  events: RoundEvent[];
  cursor: number;
  players: Player[];
  markers?: EventTimelineMarker[];
  maxVisible?: number;
  className?: string;
  onSelectCursor?: (cursor: number) => void;
};

export type EventTimelineMarker = {
  cursor: number;
  status: DecisionDifferenceStatus;
  label: string;
  title?: string;
};

export function EventTimeline({ events, cursor, players, markers = [], maxVisible = 8, className = "", onSelectCursor }: EventTimelineProps) {
  const safeCursor = clampCursor(cursor, events.length);
  const markersByCursor = new Map(markers.map((marker) => [marker.cursor, marker]));
  const visibleLimit = Number.isFinite(maxVisible) ? Math.max(1, Math.trunc(maxVisible)) : 8;
  const currentIndex = Math.max(0, safeCursor - 1);
  const eventsAfterCurrent = Math.max(0, visibleLimit - 1 - Math.floor((visibleLimit - 1) * 0.65));
  const windowEndTarget = Math.min(events.length, currentIndex + 1 + eventsAfterCurrent);
  const windowStart = safeCursor > 0 ? Math.max(0, windowEndTarget - visibleLimit) : 0;
  const windowEnd = safeCursor > 0 ? Math.min(events.length, windowStart + visibleLimit) : 0;
  const visibleEvents = safeCursor > 0 ? events.slice(windowStart, windowEnd) : [];

  return (
    <div className={`mt-4 min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3 ${className}`}>
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-800">事件时间线</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{safeCursor > 0 ? "显示当前事件附近的记录" : "停在起手状态"}</p>
        </div>
        <span className="shrink-0 rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-medium tabular-nums text-zinc-600">
          {eventProgressLabel(safeCursor, events.length)}
        </span>
      </div>

      {visibleEvents.length ? (
        <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
          {visibleEvents.map((event, index) => {
            const absoluteIndex = windowStart + index + 1;
            const isCurrent = absoluteIndex === safeCursor;
            const marker = markersByCursor.get(absoluteIndex);
            const eventText = formatRoundEvent(event, players);
            const content = (
              <>
                <span className={`text-xs font-medium tabular-nums ${isCurrent ? "text-emerald-700" : "text-zinc-400"}`}>
                  {absoluteIndex}
                </span>
                <span className={`min-w-0 truncate ${isCurrent ? "font-semibold text-zinc-950" : "text-zinc-600"}`} title={eventText}>
                  {eventText}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {marker ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ${timelineMarkerClass(marker.status)}`} title={marker.title}>
                      {marker.label}
                    </span>
                  ) : null}
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ring-1 ${eventTypePillClass(event)}`}>{eventTypeLabel(event)}</span>
                </span>
              </>
            );
            const rowClassName = `grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded border px-3 py-2 text-sm ${
              isCurrent
                ? "border-emerald-500 bg-emerald-50 shadow-sm ring-1 ring-emerald-200"
                : marker?.status === "different"
                  ? "border-amber-300 bg-amber-50/80"
                  : "border-zinc-200 bg-white/80"
            }`;

            if (onSelectCursor) {
              return (
                <button
                  key={`${absoluteIndex}-${formatRoundEvent(event, players)}`}
                  type="button"
                  onClick={() => onSelectCursor(absoluteIndex)}
                  className={`${rowClassName} text-left transition hover:border-emerald-400 hover:bg-white`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {content}
                </button>
              );
            }

            return (
              <div key={`${absoluteIndex}-${formatRoundEvent(event, players)}`} className={rowClassName} aria-current={isCurrent ? "step" : undefined}>
                {content}
              </div>
            );
          })}
        </div>
      ) : events.length ? (
        <p className="rounded border border-dashed border-zinc-200 bg-white p-3 text-sm text-zinc-500">
          当前停在起手状态。点击下一事件或拖动进度条后，这里会显示最近的真实事件。
        </p>
      ) : (
        <p className="rounded border border-dashed border-zinc-200 bg-white p-3 text-sm text-zinc-500">
          读取牌谱后会按顺序显示当前局的摸牌、切牌、副露、和了和流局事件。
        </p>
      )}
    </div>
  );
}

function IconButton({
  label,
  title = label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/15 text-white transition hover:border-white/20 hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}

function clampCursor(cursor: number, maxCursor: number) {
  if (!Number.isFinite(cursor)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(cursor), maxCursor));
}

function eventTypePillClass(event?: RoundEvent) {
  if (!event) {
    return "bg-white/15 text-white/85 ring-white/15";
  }

  const classNames: Record<RoundEvent["type"], string> = {
    "new-round": "bg-sky-50 text-sky-700 ring-sky-200",
    draw: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    discard: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    call: "bg-amber-50 text-amber-700 ring-amber-200",
    kan: "bg-orange-50 text-orange-700 ring-orange-200",
    agari: "bg-rose-50 text-rose-700 ring-rose-200",
    ryukyoku: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  };

  return classNames[event.type];
}

function timelineMarkerClass(status: DecisionDifferenceStatus) {
  const classNames: Record<DecisionDifferenceStatus, string> = {
    different: "bg-amber-100 text-amber-800 ring-amber-300",
    same: "bg-emerald-100 text-emerald-800 ring-emerald-300",
    pending: "bg-sky-100 text-sky-800 ring-sky-300",
    "engine-unavailable": "bg-zinc-100 text-zinc-600 ring-zinc-300",
    "not-comparable": "bg-violet-100 text-violet-800 ring-violet-300",
  };

  return classNames[status];
}
