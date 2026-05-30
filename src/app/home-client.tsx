"use client";

import { CircleDot, Eye, EyeOff, Import, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PaipuTable } from "@/components/paipu/paipu-table";
import { AnalysisChatPanel, DebugPanel, EngineComparePanel, OffensiveEvPanel, PaipuLibraryPanel, PlayersPanel, RoundListPanel, TileEfficiencyPanel } from "@/components/paipu/panels";
import type { MortalPreanalysisStats } from "@/components/paipu/panels";
import { EventTimeline, type EventTimelineMarker, PlaybackControls } from "@/components/paipu/playback-controls";
import { TenhouLayoutPreview } from "@/components/paipu/tenhou-layout-preview";
import { eventSeatLabel, formatRoundEvent } from "@/components/paipu/event-format";
import { buildVisibleAnalysisSnapshot, makeSnapshotKey } from "@/lib/majsoul/analysis-chat";
import { buildDecisionPoints, compareDecisionDifference, makeIdleEngineOverlay } from "@/lib/majsoul/decision-points";
import { analyzeOffensiveEv, type OffensiveEvAnalysis } from "@/lib/majsoul/offensive-ev";
import { buildPlaybackState } from "@/lib/majsoul/playback";
import { analyzeTileEfficiency } from "@/lib/majsoul/tile-efficiency";
import { formatTileName } from "@/lib/majsoul/tile-format";
import type {
  AnalysisChatMessage,
  AnalysisChatResponse,
  AnalysisLlmModelChoice,
  AnalyzeDebug,
  AnalyzeSuccess,
  DecisionDifference,
  DecisionPoint,
  EngineOverlay,
  Player,
  Round,
  VisibleAnalysisSnapshot,
} from "@/lib/majsoul/types";

type ApiError = {
  error: {
    code: string;
    message: string;
  };
  debug?: AnalyzeDebug;
};

const placeholderPlayers: Player[] = [0, 1, 2, 3].map((seat) => ({
  seat: seat as 0 | 1 | 2 | 3,
  wind: ["E", "S", "W", "N"][seat] as Player["wind"],
  name: ["东家", "南家", "西家", "北家"][seat],
  startScore: 25000,
  score: "25,000",
  style: "等待牌谱",
}));

const windNames = ["东家", "南家", "西家", "北家"];
const ANALYZE_TIMEOUT_MS = 75000;
const PLAYBACK_INTERVAL_MS = 650;
const SAVED_PAIPU_STORAGE_KEY = "mahjong-paipu-assistant.saved-paipus.v1";
const ENGINE_OVERLAY_STORAGE_KEY = "mahjong-paipu-assistant.engine-overlays.v2";
const MAX_PERSISTED_ENGINE_OVERLAYS = 400;
const DIFFERENCE_SCAN_BATCH_SIZE = 2;
const ENGINE_UNAVAILABLE_RETRY_MS = 30_000;
const ENGINE_LOADING_RETRY_MS = 20_000;
const ENGINE_REQUEST_KEY_SEPARATOR = "\u001f";

type SavedPaipuEntry = {
  id: string;
  url: string;
  region?: string;
  targetSeat?: 0 | 1 | 2 | 3;
  title: string;
  players: string[];
  roundCount: number;
  lastOpenedAt: number;
  favorite: boolean;
  note: string;
};

type PendingDifferenceJump = {
  roundId: string;
  cursor: number;
};

function dangerTone(danger: Round["danger"]) {
  if (danger === "high") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (danger === "mid") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatDifferenceLabel(difference: DecisionDifference | null, decisionCount: number) {
  if (!decisionCount) {
    return "当前局暂无可比较的自家决策点";
  }

  if (!difference) {
    return `${decisionCount} 个自家决策点`;
  }

  if (difference.status === "different" && difference.topRecommendation) {
    return `当前差异：实际 ${formatActionLabel(difference.point.actualAction, difference.point.actualTile)}，Mortal 推荐 ${formatActionLabel(difference.topRecommendation.action, difference.topRecommendation.tile)}`;
  }

  if (difference.status === "same") {
    return "当前自家操作与 Mortal 第一候选一致";
  }

  if (difference.status === "pending") {
    return `${decisionCount} 个自家决策点，当前推荐待计算`;
  }

  if (difference.status === "engine-unavailable") {
    return "Mortal 暂不可用，无法比较差异";
  }

  return `${decisionCount} 个自家决策点`;
}

function formatDecisionMarkerLabel(difference: DecisionDifference) {
  if (difference.status === "different") {
    return "差异";
  }
  if (difference.status === "same") {
    return "一致";
  }
  if (difference.status === "engine-unavailable") {
    return "不可用";
  }
  if (difference.status === "not-comparable") {
    return "参考";
  }
  return "计算中";
}

function formatDecisionMarkerTitle(difference: DecisionDifference) {
  const actual = `实际 ${formatActionLabel(difference.point.actualAction, difference.point.actualTile ?? difference.point.reactionTile)}`;
  const recommended = difference.topRecommendation ? `Mortal ${formatActionLabel(difference.topRecommendation.action, difference.topRecommendation.tile)}` : "Mortal 推荐";
  return `${actual} / ${recommended}`;
}

function formatActionLabel(action: string, tile?: string) {
  const labels: Record<string, string> = {
    discard: "切",
    riichi: "立直",
    pass: "跳过",
    chi: "吃",
    pon: "碰",
    kan: "杠",
    win: "和牌",
  };

  return `${labels[action] ?? action}${tile ? ` ${formatTileName(tile)}` : ""}`;
}

function parseSavedPaipus(raw: string): SavedPaipuEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is SavedPaipuEntry => Boolean(entry && typeof entry === "object" && typeof (entry as SavedPaipuEntry).id === "string" && typeof (entry as SavedPaipuEntry).url === "string"))
      .map((entry) => ({
        id: entry.id,
        url: entry.url,
        region: entry.region,
        targetSeat: entry.targetSeat,
        title: entry.title || entry.id,
        players: Array.isArray(entry.players) ? entry.players.filter((player): player is string => typeof player === "string") : [],
        roundCount: typeof entry.roundCount === "number" ? entry.roundCount : 0,
        lastOpenedAt: typeof entry.lastOpenedAt === "number" ? entry.lastOpenedAt : Date.now(),
        favorite: Boolean(entry.favorite),
        note: typeof entry.note === "string" ? entry.note : "",
      }))
      .sort((left, right) => Number(right.favorite) - Number(left.favorite) || right.lastOpenedAt - left.lastOpenedAt)
      .slice(0, 40);
  } catch {
    return [];
  }
}

function upsertSavedPaipu(current: SavedPaipuEntry[], next: SavedPaipuEntry) {
  const existing = current.find((entry) => entry.id === next.id);
  const merged: SavedPaipuEntry = existing
    ? {
        ...next,
        favorite: existing.favorite,
        note: existing.note,
      }
    : next;

  return [merged, ...current.filter((entry) => entry.id !== next.id)].sort((left, right) => Number(right.favorite) - Number(left.favorite) || right.lastOpenedAt - left.lastOpenedAt).slice(0, 40);
}

function parseStoredEngineOverlays(raw: string | null): Record<string, EngineOverlay> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, EngineOverlay] => typeof entry[0] === "string" && isPersistableEngineOverlay(entry[1]))
        .slice(-MAX_PERSISTED_ENGINE_OVERLAYS),
    );
  } catch {
    return {};
  }
}

function isPersistableEngineOverlay(value: unknown): value is EngineOverlay {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const overlay = value as Partial<EngineOverlay>;
  return (
    typeof overlay.snapshotKey === "string" &&
    overlay.status === "available" &&
    Array.isArray(overlay.recommendations) &&
    overlay.recommendations.length > 0 &&
    Array.isArray(overlay.warnings)
  );
}

function roundWindFromIndex(index: number): "E" | "S" | "W" | "N" {
  const winds = ["E", "S", "W", "N"] as const;
  return winds[index] ?? "E";
}

function saveStoredEngineOverlay(overlay: EngineOverlay) {
  if (!isPersistableEngineOverlay(overlay)) {
    return;
  }

  try {
    const current = parseStoredEngineOverlays(window.localStorage.getItem(ENGINE_OVERLAY_STORAGE_KEY));
    const entries = Object.entries({ ...current, [overlay.snapshotKey]: overlay }).slice(-MAX_PERSISTED_ENGINE_OVERLAYS);
    window.localStorage.setItem(ENGINE_OVERLAY_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Engine cache is an optimization; ignore storage failures.
  }
}

function loadStoredEngineOverlaysFor(points: DecisionPoint[]) {
  try {
    const stored = parseStoredEngineOverlays(window.localStorage.getItem(ENGINE_OVERLAY_STORAGE_KEY));
    const keys = new Set(points.map((point) => point.snapshotKey));
    return Object.fromEntries(Object.entries(stored).filter(([key]) => keys.has(key)));
  } catch {
    return {};
  }
}

export function HomeClient({
  initialDebugMode,
  initialLayoutPreviewMode = false,
  initialLayoutEditMode = false,
}: {
  initialDebugMode: boolean;
  initialLayoutPreviewMode?: boolean;
  initialLayoutEditMode?: boolean;
}) {
  if (initialLayoutPreviewMode) {
    return <TenhouLayoutPreview editMode={initialLayoutEditMode} />;
  }

  return <AnalyzerHomeClient initialDebugMode={initialDebugMode} />;
}

function AnalyzerHomeClient({ initialDebugMode }: { initialDebugMode: boolean }) {
  const [paipuUrl, setPaipuUrl] = useState("");
  const [targetSeat, setTargetSeat] = useState<0 | 1 | 2 | 3>(0);
  const [game, setGame] = useState<AnalyzeSuccess | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<AnalyzeDebug | null>(null);
  const [debugCopied, setDebugCopied] = useState(false);
  const [debugMode] = useState(initialDebugMode);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [eventCursor, setEventCursor] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chatMessages, setChatMessages] = useState<AnalysisChatMessage[]>([]);
  const [chatError, setChatError] = useState<{ snapshotKey: string; message: string } | null>(null);
  const [isChatPending, setIsChatPending] = useState(false);
  const [analysisLlmModel, setAnalysisLlmModel] = useState<AnalysisLlmModelChoice>("flash");
  const [engineOverlays, setEngineOverlays] = useState<Record<string, EngineOverlay>>({});
  const [differencePending, setDifferencePending] = useState(false);
  const [differenceNotice, setDifferenceNotice] = useState<string | null>(null);
  const [pendingNextRoundDifference, setPendingNextRoundDifference] = useState<PendingDifferenceJump | null>(null);
  const [pendingPreviousRoundDifference, setPendingPreviousRoundDifference] = useState<PendingDifferenceJump | null>(null);
  const [revealOpponentHands, setRevealOpponentHands] = useState(false);
  const [savedPaipus, setSavedPaipus] = useState<SavedPaipuEntry[]>([]);
  const [savedPaipusLoaded, setSavedPaipusLoaded] = useState(false);
  const [offensiveEvAnalysis, setOffensiveEvAnalysis] = useState<OffensiveEvAnalysis | null>(null);
  const [offensiveEvAnalysisKey, setOffensiveEvAnalysisKey] = useState<string | null>(null);
  const engineOverlaysRef = useRef(engineOverlays);
  const engineOverlayRequestsRef = useRef<Record<string, Promise<EngineOverlay>>>({});
  const offensiveEvRequestRef = useRef(0);

  const rounds = useMemo(() => game?.rounds ?? [], [game?.rounds]);
  const players = useMemo(() => game?.players ?? placeholderPlayers, [game?.players]);
  const selectedRound = rounds.find((round) => round.id === selectedRoundId) ?? game?.selectedRound ?? rounds[0] ?? null;
  const activeSeat = targetSeat;
  const activePlayer = players.find((player) => player.seat === activeSeat) ?? players[0];
  const maxCursor = selectedRound?.events.length ?? 0;
  const playbackPlaying = isPlaying && eventCursor < maxCursor;
  const playback = useMemo(
    () => (selectedRound ? buildPlaybackState(selectedRound, activePlayer.seat, eventCursor) : null),
    [selectedRound, activePlayer.seat, eventCursor],
  );
  const visibleEfficiencyTiles = useMemo(() => {
    if (!playback) {
      return [];
    }

    return [
      ...Object.values(playback.discards).flat(),
      ...Object.values(playback.calls).flatMap((calls) => calls.flatMap((call) => call.tiles)),
      ...playback.doraIndicators,
    ];
  }, [playback]);
  const tileEfficiency = useMemo(
    () => analyzeTileEfficiency(playback?.targetHand ?? selectedRound?.initialHands[activePlayer.seat] ?? [], visibleEfficiencyTiles),
    [activePlayer.seat, playback?.targetHand, selectedRound?.initialHands, visibleEfficiencyTiles],
  );
  const offensiveEvTiles = useMemo(
    () => playback?.targetHand ?? selectedRound?.initialHands[activePlayer.seat] ?? [],
    [activePlayer.seat, playback?.targetHand, selectedRound?.initialHands],
  );
  const currentEventText = playback?.currentEvent
    ? formatRoundEvent(playback.currentEvent, players)
    : "从起手状态开始，推进后会显示每一条真实事件。";
  const currentEventSeatText = playback?.currentEvent ? eventSeatLabel(playback.currentEvent, players) : "起手";
  const source = game?.source;
  const analysisSnapshot = useMemo<VisibleAnalysisSnapshot | null>(
    () =>
      source && selectedRound && playback
        ? buildVisibleAnalysisSnapshot({
            source,
            players,
            round: selectedRound,
            targetSeat: activePlayer.seat,
            cursor: eventCursor,
            playback,
          })
        : null,
    [activePlayer.seat, eventCursor, playback, players, selectedRound, source],
  );
  const analysisSnapshotKey = analysisSnapshot ? makeSnapshotKey(analysisSnapshot) : "no-snapshot";
  const analysisSnapshotLabel = analysisSnapshot ? `${selectedRound?.title ?? "当前局"} ${analysisSnapshot.cursor}/${analysisSnapshot.maxCursor}` : "待读取";
  const visibleChatMessages = chatMessages.filter((message) => message.snapshotKey === analysisSnapshotKey);
  const visibleChatError = chatError?.snapshotKey === analysisSnapshotKey ? chatError.message : null;
  const decisionPoints = useMemo(
    () => (source && selectedRound ? buildDecisionPoints({ sourceId: source.id, round: selectedRound, targetSeat: activePlayer.seat }) : []),
    [activePlayer.seat, selectedRound, source],
  );
  const allDecisionPoints = useMemo(
    () =>
      source
        ? rounds.flatMap((round) =>
            buildDecisionPoints({
              sourceId: source.id,
              round,
              targetSeat: activePlayer.seat,
            }),
          )
        : [],
    [activePlayer.seat, rounds, source],
  );
  const timelineMarkers = useMemo<EventTimelineMarker[]>(
    () =>
      decisionPoints.map((point) => {
        const difference = compareDecisionDifference(point, engineOverlays[point.snapshotKey]);
        return {
          cursor: point.cursor,
          status: difference.status,
          label: formatDecisionMarkerLabel(difference),
          title: formatDecisionMarkerTitle(difference),
        };
      }),
    [decisionPoints, engineOverlays],
  );
  const currentDecisionPoint = decisionPoints.find((item) => item.cursor === eventCursor) ?? decisionPoints.find((item) => item.actualEventCursor === eventCursor);
  const currentDecisionPointKey = currentDecisionPoint?.snapshotKey ?? "";
  const currentEngineSnapshot = useMemo(
    () =>
      source && selectedRound && currentDecisionPoint
        ? buildVisibleAnalysisSnapshot({
            source,
            players,
            round: selectedRound,
            targetSeat: activePlayer.seat,
            cursor: currentDecisionPoint.cursor,
            playback: buildPlaybackState(selectedRound, activePlayer.seat, currentDecisionPoint.cursor),
          })
        : null,
    [activePlayer.seat, currentDecisionPoint, players, selectedRound, source],
  );
  const currentEngineOverlay = currentDecisionPoint ? (engineOverlays[currentDecisionPoint.snapshotKey] ?? makeIdleEngineOverlay(currentDecisionPoint.snapshotKey)) : undefined;
  const currentEngineRequestKey = [
    currentDecisionPointKey,
    currentEngineOverlay?.status ?? "",
    currentEngineOverlay?.updatedAt ?? 0,
  ].join(ENGINE_REQUEST_KEY_SEPARATOR);
  const currentDecisionDifference = useMemo(
    () => {
      return currentDecisionPoint ? compareDecisionDifference(currentDecisionPoint, engineOverlays[currentDecisionPoint.snapshotKey]) : null;
    },
    [currentDecisionPoint, engineOverlays],
  );
  const displayedOffensiveEvAnalysis =
    offensiveEvAnalysis && offensiveEvAnalysisKey === analysisSnapshotKey
      ? offensiveEvAnalysis
      : { status: "empty" as const, options: [], message: "先推进到一个具体牌局状态，再看实验性进攻EV。" };
  const differenceLabel = differenceNotice ?? formatDifferenceLabel(currentDecisionDifference, decisionPoints.length);
  const mortalPreanalysisStats = useMemo<MortalPreanalysisStats>(() => {
    const overlays = allDecisionPoints.map((point) => engineOverlays[point.snapshotKey]);
    return {
      total: allDecisionPoints.length,
      ready: overlays.filter((overlay) => overlay?.status === "available").length,
      loading: overlays.filter((overlay) => overlay?.status === "loading").length,
      unavailable: overlays.filter((overlay) => overlay?.status === "unavailable").length,
    };
  }, [allDecisionPoints, engineOverlays]);

  useEffect(() => {
    if (!selectedRound || !playback || !offensiveEvTiles.length) {
      return;
    }

    const requestId = offensiveEvRequestRef.current + 1;
    offensiveEvRequestRef.current = requestId;

    void analyzeOffensiveEv({
      tiles: offensiveEvTiles,
      visibleTiles: visibleEfficiencyTiles,
      doraIndicators: playback.doraIndicators,
      openMeldCount: playback.calls[activePlayer.seat].length,
      ownDiscards: playback.discards[activePlayer.seat],
      ownCalls: playback.calls[activePlayer.seat].map((call) => ({
        callType: call.callType,
        tiles: call.tiles,
      })),
      seatWind: activePlayer.wind,
      roundWind: roundWindFromIndex(selectedRound.windRound),
    }).then((analysis) => {
      if (offensiveEvRequestRef.current === requestId) {
        setOffensiveEvAnalysis(analysis);
        setOffensiveEvAnalysisKey(analysisSnapshotKey);
      }
    });
  }, [activePlayer.seat, activePlayer.wind, analysisSnapshotKey, offensiveEvTiles, playback, selectedRound, visibleEfficiencyTiles]);

  useEffect(() => {
    if (!playbackPlaying || !selectedRound) {
      return;
    }

    const timer = window.setInterval(() => {
      setEventCursor((value) => Math.min(value + 1, maxCursor));
    }, PLAYBACK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [maxCursor, playbackPlaying, selectedRound]);

  useEffect(() => {
    engineOverlaysRef.current = engineOverlays;
  }, [engineOverlays]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(SAVED_PAIPU_STORAGE_KEY);
        if (raw) {
          setSavedPaipus(parseSavedPaipus(raw));
        }
      } catch {
        setSavedPaipus([]);
      } finally {
        setSavedPaipusLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!savedPaipusLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(SAVED_PAIPU_STORAGE_KEY, JSON.stringify(savedPaipus.slice(0, 40)));
    } catch {
      // localStorage can be unavailable in privacy modes; the app can continue without persistence.
    }
  }, [savedPaipus, savedPaipusLoaded]);

  async function analyzePaipu(event?: FormEvent<HTMLFormElement>, explicitUrl?: string, explicitTargetSeat?: 0 | 1 | 2 | 3) {
    event?.preventDefault();
    const submittedUrl = explicitUrl?.trim() || (event ? String(new FormData(event.currentTarget).get("url") ?? "").trim() : paipuUrl.trim());
    const requestedUrl = submittedUrl || paipuUrl.trim();
    const requestedTargetSeat = explicitTargetSeat ?? targetSeat;

    const shouldPreserveRound = Boolean(game?.source.url === requestedUrl && selectedRoundId);

    if (requestedUrl !== paipuUrl) {
      setPaipuUrl(requestedUrl);
    }

    setError(null);
    setDebugInfo(null);
    setDebugCopied(false);
    setIsAnalyzing(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: requestedUrl,
          targetSeat: requestedTargetSeat,
          ...(shouldPreserveRound ? { roundId: selectedRoundId ?? undefined } : {}),
          debug: debugMode,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as AnalyzeSuccess | ApiError;

      if ("error" in payload) {
        setError(payload.error.message);
        setDebugInfo(payload.debug ?? null);
        return;
      }

      setGame(payload);
      setTargetSeat(payload.targetSeat);
      setDebugInfo(payload.debug ?? null);
      setSelectedRoundId(payload.selectedRound?.id ?? payload.rounds[0]?.id ?? null);
      setEventCursor(0);
      setIsPlaying(false);
      setChatMessages([]);
      setChatError(null);
      engineOverlaysRef.current = {};
      setEngineOverlays({});
      setDifferencePending(false);
      setDifferenceNotice(null);
      setPendingNextRoundDifference(null);
      setPendingPreviousRoundDifference(null);
      rememberPaipu(payload);
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === "AbortError" ? "读取牌谱超时，请检查代理或网关配置后重试。" : "请求牌谱分析失败，请稍后重试。");
    } finally {
      window.clearTimeout(timeout);
      setIsAnalyzing(false);
    }
  }

  function rememberPaipu(payload: AnalyzeSuccess) {
    const entry: SavedPaipuEntry = {
      id: payload.source.id,
      url: payload.source.url,
      region: payload.source.region,
      targetSeat: payload.targetSeat,
      title: payload.rounds[0]?.title ? `${payload.rounds[0].title} 起` : payload.source.id,
      players: payload.players.map((player) => player.name),
      roundCount: payload.rounds.length,
      lastOpenedAt: Date.now(),
      favorite: false,
      note: "",
    };

    setSavedPaipus((current) => upsertSavedPaipu(current, entry));
  }

  function openSavedPaipu(entry: SavedPaipuEntry) {
    setPaipuUrl(entry.url);
    if (entry.targetSeat !== undefined) {
      setTargetSeat(entry.targetSeat);
    }
    void analyzePaipu(undefined, entry.url, entry.targetSeat);
  }

  function toggleSavedFavorite(id: string) {
    setSavedPaipus((current) => current.map((entry) => (entry.id === id ? { ...entry, favorite: !entry.favorite } : entry)));
  }

  function updateSavedNote(id: string, note: string) {
    setSavedPaipus((current) => current.map((entry) => (entry.id === id ? { ...entry, note } : entry)));
  }

  function removeSavedPaipu(id: string) {
    setSavedPaipus((current) => current.filter((entry) => entry.id !== id));
  }

  function selectRound(roundId: string) {
    setSelectedRoundId(roundId);
    setEventCursor(0);
    setIsPlaying(false);
    setDifferenceNotice(null);
    setPendingNextRoundDifference(null);
    setPendingPreviousRoundDifference(null);
  }

  function selectTargetSeat(seat: 0 | 1 | 2 | 3) {
    setTargetSeat(seat);
    setIsPlaying(false);
    setChatMessages([]);
    setChatError(null);
    setDifferencePending(false);
    setDifferenceNotice(null);
    setPendingNextRoundDifference(null);
    setPendingPreviousRoundDifference(null);
  }

  function updateCursor(cursor: number) {
    setEventCursor(Math.max(0, Math.min(cursor, maxCursor)));
    setIsPlaying(false);
    setDifferenceNotice(null);
    setPendingNextRoundDifference(null);
    setPendingPreviousRoundDifference(null);
  }

  const requestEngineOverlay = useCallback(
    async (snapshot: VisibleAnalysisSnapshot, visibleEvents = selectedRound?.events.slice(0, snapshot.cursor) ?? []) => {
      const snapshotKey = makeSnapshotKey(snapshot);
      const cached = engineOverlaysRef.current[snapshotKey];

      if (cached?.status === "available" && cached.recommendations.length > 0) {
        return cached;
      }

      if (cached?.status === "unavailable" && Date.now() - (cached.updatedAt ?? 0) < ENGINE_UNAVAILABLE_RETRY_MS) {
        return cached;
      }

      const inFlight = engineOverlayRequestsRef.current[snapshotKey];
      if (inFlight) {
        return inFlight;
      }

      const previous = engineOverlaysRef.current[snapshotKey];
      if (previous?.status === "loading" && Date.now() - (previous.updatedAt ?? 0) < ENGINE_LOADING_RETRY_MS) {
        return previous;
      }

      const loadingOverlay = { ...makeIdleEngineOverlay(snapshotKey), status: "loading" as const, updatedAt: Date.now() };
      engineOverlaysRef.current = { ...engineOverlaysRef.current, [snapshotKey]: loadingOverlay };
      setEngineOverlays((current) => ({
        ...current,
        [snapshotKey]: loadingOverlay,
      }));

      const requestPromise = (async () => {
        try {
          const response = await fetch("/api/engine-overlay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              snapshot,
              visibleEvents,
            }),
          });
          const payload = (await response.json()) as { overlay?: EngineOverlay } | ApiError;

          if ("error" in payload || !payload.overlay) {
            const overlay: EngineOverlay = {
              snapshotKey,
              status: "unavailable",
              recommendations: [],
              warnings: ["Mortal 推荐暂时不可用。"],
              updatedAt: Date.now(),
            };
            engineOverlaysRef.current = { ...engineOverlaysRef.current, [snapshotKey]: overlay };
            saveStoredEngineOverlay(overlay);
            setEngineOverlays((current) => ({ ...current, [snapshotKey]: overlay }));
            return overlay;
          }

          const overlay = payload.overlay as EngineOverlay;
          engineOverlaysRef.current = { ...engineOverlaysRef.current, [snapshotKey]: overlay };
          saveStoredEngineOverlay(overlay);
          setEngineOverlays((current) => ({ ...current, [snapshotKey]: overlay }));
          return overlay;
        } catch {
          const overlay: EngineOverlay = {
            snapshotKey,
            status: "unavailable",
            recommendations: [],
            warnings: ["Mortal 推荐请求失败。"],
            updatedAt: Date.now(),
          };
          engineOverlaysRef.current = { ...engineOverlaysRef.current, [snapshotKey]: overlay };
          saveStoredEngineOverlay(overlay);
          setEngineOverlays((current) => ({ ...current, [snapshotKey]: overlay }));
          return overlay;
        }
      })().finally(() => {
        if (engineOverlayRequestsRef.current[snapshotKey] === requestPromise) {
          const remaining = { ...engineOverlayRequestsRef.current };
          delete remaining[snapshotKey];
          engineOverlayRequestsRef.current = remaining;
        }
      });

      engineOverlayRequestsRef.current = { ...engineOverlayRequestsRef.current, [snapshotKey]: requestPromise };
      return requestPromise;
    },
    [selectedRound?.events],
  );

  useEffect(() => {
    const snapshot = currentEngineSnapshot;
    const [decisionPointKey, overlayStatus, overlayUpdatedAtText] = currentEngineRequestKey.split(ENGINE_REQUEST_KEY_SEPARATOR);
    const overlayUpdatedAt = Number(overlayUpdatedAtText) || 0;

    if (!snapshot || !decisionPointKey || overlayStatus === "available") {
      return;
    }

    if (overlayStatus === "loading" && Date.now() - overlayUpdatedAt < ENGINE_LOADING_RETRY_MS) {
      return;
    }

    if (overlayStatus === "unavailable" && Date.now() - overlayUpdatedAt < ENGINE_UNAVAILABLE_RETRY_MS) {
      return;
    }

    const timer = window.setTimeout(() => {
      void requestEngineOverlay(snapshot);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentEngineSnapshot, currentEngineRequestKey, requestEngineOverlay]);

  useEffect(() => {
    if (!source || !rounds.length || !allDecisionPoints.length) {
      return;
    }

    const storedOverlays = loadStoredEngineOverlaysFor(allDecisionPoints);
    if (!Object.keys(storedOverlays).length) {
      return;
    }

    engineOverlaysRef.current = { ...storedOverlays, ...engineOverlaysRef.current };
    queueMicrotask(() => {
      setEngineOverlays((current) => ({ ...storedOverlays, ...current }));
    });
  }, [allDecisionPoints, rounds.length, source]);

  async function jumpToDifference(direction: "previous" | "next") {
    if (!source || !selectedRound || !decisionPoints.length) {
      return;
    }

    if (direction === "next" && pendingNextRoundDifference) {
      setSelectedRoundId(pendingNextRoundDifference.roundId);
      setEventCursor(pendingNextRoundDifference.cursor);
      setPendingNextRoundDifference(null);
      setDifferenceNotice(null);
      setIsPlaying(false);
      return;
    }

    if (direction === "previous" && pendingPreviousRoundDifference) {
      setSelectedRoundId(pendingPreviousRoundDifference.roundId);
      setEventCursor(pendingPreviousRoundDifference.cursor);
      setPendingPreviousRoundDifference(null);
      setDifferenceNotice(null);
      setIsPlaying(false);
      return;
    }

    setDifferenceNotice(null);
    setPendingNextRoundDifference(null);
    setPendingPreviousRoundDifference(null);
    setDifferencePending(true);
    setIsPlaying(false);

    try {
      const ordered = direction === "next" ? decisionPoints.filter((point) => point.cursor > eventCursor) : [...decisionPoints].reverse().filter((point) => point.cursor < eventCursor);
      const currentRoundDifference = await findFirstDifferenceInPoints(selectedRound, ordered);
      if (currentRoundDifference) {
        setEventCursor(currentRoundDifference.cursor);
        return;
      }

      if (direction === "next") {
        const nextRoundDifference = await findNextRoundDifference();

        if (nextRoundDifference) {
          setPendingNextRoundDifference(nextRoundDifference);
          setDifferenceNotice("这是这一局最后一个差异点了，再点击进入下一局的第一个差异点。");
          return;
        }

        setDifferenceNotice("已经看完全部差异点了。");
        return;
      }

      const previousRoundDifference = await findPreviousRoundDifference();

      if (previousRoundDifference) {
        setPendingPreviousRoundDifference(previousRoundDifference);
        setDifferenceNotice("这是这一局第一个差异点了，再点击进入上一局的最后一个差异点。");
        return;
      }

      setDifferenceNotice("已经回到全部差异点的开头了。");
    } finally {
      setDifferencePending(false);
    }
  }

  async function findNextRoundDifference(): Promise<PendingDifferenceJump | null> {
    if (!source || !selectedRound) {
      return null;
    }

    const selectedRoundIndex = rounds.findIndex((round) => round.id === selectedRound.id);
    const laterRounds = selectedRoundIndex >= 0 ? rounds.slice(selectedRoundIndex + 1) : [];

    for (const round of laterRounds) {
      const points = buildDecisionPoints({ sourceId: source.id, round, targetSeat: activePlayer.seat });
      const point = await findFirstDifferenceInPoints(round, points);

      if (point) {
        return { roundId: round.id, cursor: point.cursor };
      }
    }

    return null;
  }

  async function findPreviousRoundDifference(): Promise<PendingDifferenceJump | null> {
    if (!source || !selectedRound) {
      return null;
    }

    const selectedRoundIndex = rounds.findIndex((round) => round.id === selectedRound.id);
    const earlierRounds = selectedRoundIndex >= 0 ? rounds.slice(0, selectedRoundIndex).reverse() : [];

    for (const round of earlierRounds) {
      const points = buildDecisionPoints({ sourceId: source.id, round, targetSeat: activePlayer.seat }).reverse();
      const point = await findFirstDifferenceInPoints(round, points);

      if (point) {
        return { roundId: round.id, cursor: point.cursor };
      }
    }

    return null;
  }

  async function findFirstDifferenceInPoints(round: Round, ordered: DecisionPoint[]) {
    if (!source) {
      return null;
    }

    let firstUnresolvedIndex = -1;

    for (const [index, point] of ordered.entries()) {
      const difference = compareDecisionDifference(point, engineOverlaysRef.current[point.snapshotKey]);
      if (difference.status === "different") {
        return point;
      }

      if (difference.status === "pending") {
        firstUnresolvedIndex = index;
        break;
      }
    }

    if (firstUnresolvedIndex < 0) {
      return null;
    }

    const unresolved = ordered.slice(firstUnresolvedIndex);

    for (let index = 0; index < unresolved.length; index += DIFFERENCE_SCAN_BATCH_SIZE) {
      const batch = unresolved.slice(index, index + DIFFERENCE_SCAN_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (point) => {
          const cached = engineOverlaysRef.current[point.snapshotKey];
          if (cached && cached.status !== "idle" && cached.status !== "loading") {
            return { point, overlay: cached };
          }

          const snapshotPlayback = buildPlaybackState(round, activePlayer.seat, point.cursor);
          const snapshot = buildVisibleAnalysisSnapshot({
            source,
            players,
            round,
            targetSeat: activePlayer.seat,
            cursor: point.cursor,
            playback: snapshotPlayback,
          });

          return {
            point,
            overlay: await requestEngineOverlay(snapshot, round.events.slice(0, point.cursor)),
          };
        }),
      );

      for (const { point, overlay } of results) {
        const difference = compareDecisionDifference(point, overlay);

        if (difference.status === "different") {
          return point;
        }
      }
    }

    return null;
  }

  async function askAnalysisChat(question: string) {
    if (!analysisSnapshot) {
      setChatError({ snapshotKey: analysisSnapshotKey, message: "请先读取牌谱，并停在想复盘的事件点。" });
      return;
    }

    const snapshotKey = makeSnapshotKey(analysisSnapshot);
    const userMessage: AnalysisChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      snapshotKey,
    };

    setChatMessages((messages) => [...messages, userMessage]);
    setChatError(null);
    setIsChatPending(true);

    try {
      const response = await fetch("/api/analysis-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          mode: "current-hand",
          snapshot: analysisSnapshot,
          visibleEvents: selectedRound?.events.slice(0, analysisSnapshot.cursor) ?? [],
          llmModel: analysisLlmModel,
        }),
      });
      const payload = (await response.json()) as AnalysisChatResponse | ApiError;

      if ("error" in payload) {
        setChatError({ snapshotKey, message: payload.error.message });
        return;
      }

      setChatMessages((messages) => [
        ...messages,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer,
          snapshotKey: payload.snapshotKey,
          structured: payload.structured,
        },
      ]);
    } catch {
      setChatError({ snapshotKey, message: "复盘聊天请求失败，请稍后重试。" });
    } finally {
      setIsChatPending(false);
    }
  }

  const playbackControls = (
    <PlaybackControls
      cursor={eventCursor}
      maxCursor={maxCursor}
      isPlaying={playbackPlaying}
      disabled={!selectedRound}
      className="w-full max-w-full"
      onCursorChange={updateCursor}
      onStepPrevious={() => updateCursor(eventCursor - 1)}
      onStepNext={() => updateCursor(eventCursor + 1)}
      onReset={() => updateCursor(0)}
      onTogglePlay={() => setIsPlaying((value) => !value)}
      onPreviousDifference={() => void jumpToDifference("previous")}
      onNextDifference={() => void jumpToDifference("next")}
      differencePending={differencePending}
      differenceDisabled={!decisionPoints.length}
      differenceLabel={differenceLabel}
    />
  );

  return (
    <main className="min-h-screen bg-[#f7f7f3] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1700px] flex-col gap-5 px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-zinc-950 text-white">
              <CircleDot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">日麻牌谱解析助手</h1>
              <p className="truncate text-sm text-zinc-500">导入雀魂/天凤/一番街牌谱，边看牌桌边复盘。</p>
            </div>
          </div>

          <form onSubmit={analyzePaipu} className="flex w-full min-w-0 flex-col gap-3 lg:max-w-4xl">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row">
              <label className="sr-only" htmlFor="paipu-url">
                雀魂/天凤/一番街牌谱链接
              </label>
              <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3">
                <Import className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                <input
                  id="paipu-url"
                  value={paipuUrl}
                  name="url"
                  onChange={(event) => setPaipuUrl(event.target.value)}
                  className="min-w-0 w-full bg-transparent text-sm outline-none"
                  placeholder="粘贴雀魂、天凤或一番街牌谱，例如 https://game.maj-soul.com/1/?paipu=...、https://tenhou.net/0/?log=... 或 ch35u1e9nc70954ah9n0"
                />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                读取牌谱
              </button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <span className="shrink-0 text-zinc-500">我的视角</span>
              {[0, 1, 2, 3].map((seat) => (
                <button
                  key={seat}
                  type="button"
                  onClick={() => selectTargetSeat(seat as 0 | 1 | 2 | 3)}
                  className={`h-8 rounded border px-3 text-xs font-medium ${
                    targetSeat === seat ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600"
                  }`}
                >
                  {windNames[seat]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRevealOpponentHands((value) => !value)}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                {revealOpponentHands ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                {revealOpponentHands ? "显示牌背" : "显示他家手牌"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-[1700px] px-4 py-4 sm:px-5">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[236px_minmax(0,1fr)_338px] lg:items-start">
          <aside className="order-2 grid min-w-0 gap-2 md:grid-cols-2 lg:order-1 lg:block lg:space-y-2">
            <PaipuLibraryPanel entries={savedPaipus} onOpen={openSavedPaipu} onToggleFavorite={toggleSavedFavorite} onUpdateNote={updateSavedNote} onRemove={removeSavedPaipu} />
            <RoundListPanel rounds={rounds} players={players} selectedRoundId={selectedRound?.id ?? selectedRoundId} onSelectRound={selectRound} />
            <PlayersPanel players={players} targetSeat={targetSeat} scores={playback?.scores} onSelectSeat={selectTargetSeat} />
          </aside>

          <section className="order-1 min-w-0 space-y-3 lg:order-2">
            {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

            <div className="min-w-0 overflow-visible rounded-lg border border-zinc-200 bg-white p-3 sm:p-4">
              <div className="mb-4 flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold">{selectedRound?.title ?? "等待读取牌谱"}</h2>
                  <p className="mt-1 break-words text-sm leading-6 text-zinc-500">
                    {selectedRound?.focus ?? "读取成功后会展示每局起手、摸切、副露、结算和基础摘要。"}
                  </p>
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">目标 seat {activePlayer.seat}</span>
                    <span className="max-w-full truncate rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                      {activePlayer.wind} / {activePlayer.name}
                    </span>
                  </div>
                </div>
                <div className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${dangerTone(selectedRound?.danger ?? "low")}`}>
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  {selectedRound?.danger === "high" ? "高风险局" : selectedRound?.danger === "mid" ? "中风险局" : "低风险局"}
                </div>
              </div>

              <PaipuTable
                players={players}
                selectedRound={selectedRound}
                activePlayer={activePlayer}
                playback={playback}
                currentEventText={currentEventText}
                currentEventSeatText={currentEventSeatText}
                controlsSlot={playbackControls}
                engineOverlay={currentEngineOverlay}
                decisionDifference={currentDecisionDifference}
                revealOpponentHands={revealOpponentHands}
                onSelectSeat={selectTargetSeat}
              />

              <EventTimeline
                events={selectedRound?.events ?? []}
                cursor={eventCursor}
                players={players}
                markers={timelineMarkers}
                onSelectCursor={(cursor) => updateCursor(cursor)}
              />
            </div>
          </section>

          <aside className="order-3 grid min-w-0 gap-2 md:grid-cols-2 lg:order-3 lg:block lg:space-y-2">
            <EngineComparePanel difference={currentDecisionDifference} overlay={currentEngineOverlay} preanalysisStats={mortalPreanalysisStats} />
            <TileEfficiencyPanel analysis={tileEfficiency} />
            <OffensiveEvPanel analysis={displayedOffensiveEvAnalysis} />
            <AnalysisChatPanel
              messages={visibleChatMessages}
              disabled={!analysisSnapshot}
              pending={isChatPending}
              model={analysisLlmModel}
              snapshotLabel={analysisSnapshotLabel}
              error={visibleChatError}
              onModelChange={setAnalysisLlmModel}
              onAsk={askAnalysisChat}
            />
          </aside>

          {debugMode ? (
            <div className="order-4 min-w-0 lg:col-start-2 lg:col-end-4">
              <DebugPanel
                debug={debugInfo}
                copied={debugCopied}
                onCopy={async () => {
                  if (!debugInfo) {
                    return;
                  }

                  await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                  setDebugCopied(true);
                }}
              />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
