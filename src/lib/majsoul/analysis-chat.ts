import { buildPlaybackState, type PlaybackSeat, type PlaybackState } from "./playback";
import { analyzeCurrentHandWithEngine, type AnalysisEngineDependencies } from "./analysis-engine";
import { runCurrentHandAnalysisGraph, validateAnalysisAnswer } from "./analysis-graph";
import { generateLlmAnalysis, type AnalysisLlmDependencies } from "./analysis-llm";
import { buildDecisionContext, formatDecisionContextSummary } from "./decision-context";
import { analyzeOffensiveEv, type OffensiveEvScoreFn } from "./offensive-ev";
import { analyzeRouteFactors } from "./route-factors";
import { buildTileSafetyHintFromSnapshot } from "./safety-hints";
import { analyzeTileEfficiency } from "./tile-efficiency";
import { formatTileName, formatTileNames } from "./tile-format";
import type {
  AnalysisContext,
  AnalysisChatRequest,
  AnalysisChatResponse,
  AnalysisChatStructured,
  AnalysisEngineResult,
  AnalysisLlmResult,
  CurrentHandAnalysisPackage,
  Player,
  Round,
  RoundEvent,
  VisibleAnalysisCall,
  VisibleAnalysisSnapshot,
} from "./types";

export type AnalysisChatDependencies = {
  engine?: AnalysisEngineDependencies;
  llm?: AnalysisLlmDependencies;
  scoreWinningHand?: OffensiveEvScoreFn;
};

export function buildVisibleAnalysisSnapshot({
  source,
  players,
  round,
  targetSeat,
  cursor,
  playback,
}: {
  source: VisibleAnalysisSnapshot["source"];
  players: Player[];
  round: Round;
  targetSeat: PlaybackSeat;
  cursor: number;
  playback?: PlaybackState | null;
}): VisibleAnalysisSnapshot {
  const state = playback ?? buildPlaybackState(round, targetSeat, cursor);

  return {
    source: {
      id: source.id,
      region: source.region,
    },
    round: {
      id: round.id,
      title: round.title,
      windRound: round.windRound,
      roundNumber: round.roundNumber,
      honba: round.honba,
      riichiSticks: round.riichiSticks,
      dealer: round.dealer,
      danger: round.danger,
    },
    cursor: state.cursor,
    maxCursor: state.maxCursor,
    targetSeat,
    players: players.map((player) => ({
      seat: player.seat,
      wind: player.wind,
      name: player.name,
      score: player.score,
      startScore: player.startScore,
      style: player.style,
    })),
    doraIndicators: [...state.doraIndicators],
    targetHand: [...state.hands[targetSeat]],
    drawnTile: state.drawnTile,
    discards: copySeatTiles(state.discards),
    calls: copySeatCalls(state.calls),
    riichiTiles: copySeatTiles(state.riichiTiles),
    currentEvent: state.currentEvent,
    currentEventText: state.currentEvent ? formatVisibleEvent(state.currentEvent, players) : "起手状态",
    previousEventText: state.previousEvent ? formatVisibleEvent(state.previousEvent, players) : undefined,
    roundResult: state.roundResult,
  };
}

export async function answerAnalysisChat(request: AnalysisChatRequest, dependencies: AnalysisChatDependencies = {}): Promise<AnalysisChatResponse> {
  const question = request.question.trim();
  const snapshot = request.snapshot;
  const snapshotKey = makeSnapshotKey(snapshot);
  const visibleSummary = summarizeSnapshot(snapshot);
  const context = buildAnalysisContext({ question, snapshot, visibleEvents: request.visibleEvents, visibleSummary });
  const warnings = [
    "以下内容只基于当前光标之前的可见信息，不读取未来事件。",
    "Mortal/专业引擎结果作为牌桌候选提示返回，聊天回答不重复展示完整引擎列表。",
  ];

  if (!question) {
    const engine = unavailableEngine("尚未提出复盘问题，未调用专业麻将引擎。");
    const llm = {
      provider: "heuristic" as const,
      model: null,
      status: "unavailable" as const,
      warnings: ["尚未提出复盘问题，未调用 LLM。"],
    };

    return {
      answer: "先输入一个想复盘的问题，例如“这一步怎么打”或“现在危险牌有哪些”。",
      snapshotKey,
      engine,
      llm,
      visibleSummary,
      warnings: [...warnings, ...engine.warnings, ...llm.warnings],
    };
  }

  const engine = await analyzeCurrentHandWithEngine(context, dependencies.engine);
  const graphState = await runCurrentHandAnalysisGraph(context, engine, { scoreWinningHand: dependencies.scoreWinningHand });
  const enrichedContext: AnalysisContext = {
    ...context,
    analysisPackage: graphState.analysisPackage,
  };
  const llmAnswer = await generateLlmAnalysis(enrichedContext, engine, { ...dependencies.llm, modelChoice: request.llmModel });
  const validation = llmAnswer.structured ? validateAnalysisAnswer(llmAnswer.structured, graphState) : null;
  const structuredBase = validation?.structured ?? graphState.directAnswer ?? buildHybridFallbackStructured(question, snapshot, llmAnswer.llm, enrichedContext.analysisPackage);
  const structuredWithWarnings =
    !llmAnswer.structured && llmAnswer.llm.warnings.length
      ? {
          ...structuredBase,
          risks: [...structuredBase.risks, ...llmAnswer.llm.warnings].slice(0, 5),
        }
      : structuredBase;
  const structuredWithBoundary = appendExplanationBoundary(structuredWithWarnings, enrichedContext.analysisPackage?.tableInference);
  const llmNotice = buildLlmFrontNotice(llmAnswer.llm);
  const structured = llmNotice ? prependStructuredNotice(structuredWithBoundary, llmNotice) : structuredWithBoundary;
  const baseAnswer = enrichedContext.analysisPackage?.tableInference?.applies || validation?.warnings.length ? formatStructuredChatAnswer(structured) : (llmAnswer.answer ?? formatStructuredChatAnswer(structured));
  const answer = llmNotice && !baseAnswer.startsWith(llmNotice) ? `${llmNotice}\n${baseAnswer}` : baseAnswer;

  return {
    answer,
    snapshotKey,
    engine,
    llm: llmAnswer.llm,
    visibleSummary,
    structured,
    warnings: [...warnings, ...engine.warnings, ...llmAnswer.llm.warnings, ...(validation?.warnings ?? [])],
  };
}

function appendExplanationBoundary(
  structured: AnalysisChatStructured,
  tableInference: CurrentHandAnalysisPackage["tableInference"] | undefined,
): AnalysisChatStructured {
  if (!tableInference?.applies || structured.conclusion.includes(tableInference.reason)) {
    return structured;
  }

  return {
    ...structured,
    conclusion: `${structured.conclusion}\n${tableInference.reason}`,
  };
}

function buildLlmFrontNotice(llm: AnalysisLlmResult) {
  if (llm.failureReason === "timeout") {
    return "LLM 请求超时，以下是本地降级分析。";
  }

  return "";
}

function prependStructuredNotice(structured: AnalysisChatStructured, notice: string): AnalysisChatStructured {
  if (!notice || structured.conclusion.startsWith(notice)) {
    return structured;
  }

  return {
    ...structured,
    conclusion: `${notice}\n${structured.conclusion}`,
  };
}

export function makeSnapshotKey(snapshot: VisibleAnalysisSnapshot) {
  return `${snapshot.source.id}:${snapshot.round.id}:${snapshot.cursor}/${snapshot.maxCursor}:seat${snapshot.targetSeat}`;
}

export function buildAnalysisContext({
  question,
  snapshot,
  visibleEvents,
}: {
  question: string;
  snapshot: VisibleAnalysisSnapshot;
  visibleEvents?: RoundEvent[];
  visibleSummary?: string[];
}): AnalysisContext {
  const safeSnapshot = sanitizeSnapshot(snapshot);
  const decisionContext = buildDecisionContext(safeSnapshot, question);

  return {
    mode: "current-hand",
    question,
    snapshot: safeSnapshot,
    visibleEvents: sanitizeVisibleEvents(visibleEvents, snapshot.cursor),
    visibleSummary: summarizeSnapshot(safeSnapshot),
    decisionContext,
  };
}

export async function buildCurrentHandAnalysisPackage(
  snapshot: VisibleAnalysisSnapshot,
  engine: AnalysisEngineResult,
  decisionContext: AnalysisContext["decisionContext"] = buildDecisionContext(snapshot, ""),
  dependencies: Pick<AnalysisChatDependencies, "scoreWinningHand"> = {},
): Promise<CurrentHandAnalysisPackage> {
  const visibleTiles = [
    ...Object.values(snapshot.discards).flat(),
    ...Object.values(snapshot.calls).flatMap((calls) => calls.flatMap((call) => call.tiles)),
    ...snapshot.doraIndicators,
  ];
  const tileEfficiency = analyzeTileEfficiency(snapshot.targetHand, visibleTiles);
  const targetPlayer = snapshot.players.find((player) => player.seat === snapshot.targetSeat);
  const offensiveEv = await analyzeOffensiveEv({
    tiles: snapshot.targetHand,
    visibleTiles,
    doraIndicators: snapshot.doraIndicators,
    openMeldCount: snapshot.calls[snapshot.targetSeat].length,
    ownDiscards: snapshot.discards[snapshot.targetSeat],
    ownCalls: snapshot.calls[snapshot.targetSeat],
    seatWind: targetPlayer?.wind ?? "E",
    roundWind: roundWindFromIndex(snapshot.round.windRound),
    scoreWinningHand: dependencies.scoreWinningHand,
  });
  const engineTop = [...engine.recommendations].sort((left, right) => left.rank - right.rank).slice(0, 3);
  const engineTiles = engineTop.map((recommendation) => recommendation.tile).filter((tile): tile is string => Boolean(tile));
  const packagedEfficiencyOptions = selectEfficiencyOptions(tileEfficiency.discardOptions, engineTiles, 6);
  const packagedOffensiveEvOptions = selectEfficiencyOptions(offensiveEv.options, engineTiles, 6);
  const efficiencyTiles = packagedEfficiencyOptions.slice(0, 3).map((option) => option.discard);
  const routeFactorOptions = analyzeRouteFactors({
    tiles: snapshot.targetHand,
    candidateDiscards: [...new Set([...engineTiles, ...efficiencyTiles])],
    seatWind: targetPlayer?.wind ?? "E",
    roundWind: roundWindFromIndex(snapshot.round.windRound),
  });
  const packagedRouteFactors = selectEfficiencyOptions(routeFactorOptions, engineTiles, 6);
  const safetyTiles = [...new Set([...engineTiles, ...efficiencyTiles])].slice(0, 6);
  const candidateHints = safetyTiles
    .map((tile) => buildTileSafetyHintFromSnapshot({ tile, snapshot }))
    .filter((hint): hint is NonNullable<ReturnType<typeof buildTileSafetyHintFromSnapshot>> => Boolean(hint));
  return {
    readonlyNotice: "只基于当前光标之前的可见信息，不读取未来事件或牌山。",
    decisionContext,
    hand: {
      tiles: [...snapshot.targetHand],
      drawnTile: snapshot.drawnTile,
      doraIndicators: [...snapshot.doraIndicators],
    },
    engine: {
      status: engine.status,
      topRecommendations: engineTop.map((recommendation) => {
        const safety = recommendation.tile ? candidateHints.find((hint) => hint.tile === recommendation.tile) : undefined;
        return {
          rank: recommendation.rank,
          action: recommendation.action,
          tile: recommendation.tile,
          label: formatRecommendationForUser(recommendation),
          probability: recommendation.probability,
          tags: [...recommendation.tags],
          safety: safety
            ? {
                tone: safety.tone,
                labels: [...safety.labels],
                description: safety.description,
              }
            : undefined,
        };
      }),
      warnings: [...engine.warnings],
    },
    tileEfficiency: {
      status: tileEfficiency.status,
      tileCount: tileEfficiency.tileCount,
      shanten: tileEfficiency.shanten,
      standardShanten: tileEfficiency.standardShanten,
      sevenPairsShanten: tileEfficiency.sevenPairsShanten,
      thirteenOrphansShanten: tileEfficiency.thirteenOrphansShanten,
      topDiscards: packagedEfficiencyOptions.map((option) => ({
        discard: option.discard,
        label: `切 ${formatTileName(option.discard)}：${formatShanten(option.shantenAfterDiscard)}，剩余受入 ${option.waitCount} 枚`,
        shantenAfterDiscard: option.shantenAfterDiscard,
        waitCount: option.waitCount,
        waits: option.waits.slice(0, 6).map((wait) => `${formatTileName(wait.tile)} ${wait.remaining}/${wait.theoretical}`),
      })),
      message: tileEfficiency.message,
    },
    offensiveEv: {
      status: offensiveEv.status,
      topDiscards: packagedOffensiveEvOptions.map((option) => ({
        discard: option.discard,
        label:
          option.shantenAfterDiscard <= 1
            ? `切 ${formatTileName(option.discard)}：实验性进攻EV ${option.offensiveEv}，预计打点 ${option.averageScore}，进张 ${option.ukeire} 枚`
            : `切 ${formatTileName(option.discard)}：远手路线参考 ${option.offensiveEv}，预计打点 ${option.averageScore}，进张 ${option.ukeire} 枚`,
        shantenAfterDiscard: option.shantenAfterDiscard,
        ukeire: option.ukeire,
        waitCount: option.waitCount,
        averageScore: option.averageScore,
        offensiveEv: option.offensiveEv,
        waits: option.waits.slice(0, 6).map(formatTileName),
        furitenWaits: option.furitenWaits.slice(0, 6).map(formatTileName),
        branches: option.branches.slice(0, 4).map((branch) => `摸 ${formatTileName(branch.draw)} 后${branch.bestDiscard ? `切 ${formatTileName(branch.bestDiscard)}，` : ""}听牌等待 ${branch.tenpaiWaitCount} 枚，平均打点 ${branch.averageScore}`),
        notes: option.notes.slice(0, 3),
      })),
      message: offensiveEv.message,
    },
    routeFactors: {
      topDiscards: packagedRouteFactors,
      message: "牌型路线只识别断幺、役牌、混一色、七对子四类稳定路线；不猜三色、一气、平和等细路线。",
    },
    safety: {
      riichiSeats: ([0, 1, 2, 3] as PlaybackSeat[]).filter((seat) => snapshot.riichiTiles[seat].length > 0 && seat !== snapshot.targetSeat),
      candidateHints: candidateHints.map((hint) => ({
        tile: hint.tile,
        tone: hint.tone,
        labels: [...hint.labels],
        description: hint.description,
      })),
    },
  };
}

function selectEfficiencyOptions<T extends { discard: string }>(options: T[], importantTiles: string[], maxItems: number) {
  const selected: T[] = [];
  const add = (option: T | undefined) => {
    if (option && !selected.some((item) => item.discard === option.discard)) {
      selected.push(option);
    }
  };

  options.slice(0, 4).forEach(add);
  importantTiles.forEach((tile) => add(options.find((option) => option.discard === tile)));

  return selected.slice(0, maxItems);
}

function buildHybridFallbackStructured(
  question: string,
  snapshot: VisibleAnalysisSnapshot,
  llm: AnalysisLlmResult,
  analysisPackage: CurrentHandAnalysisPackage | undefined,
): AnalysisChatStructured {
  const topEngine = analysisPackage?.engine.topRecommendations[0];
  const topEfficiency = analysisPackage?.tileEfficiency.topDiscards[0];
  const safetyHints = analysisPackage?.safety.candidateHints ?? [];
  const target = snapshot.players.find((player) => player.seat === snapshot.targetSeat);
  const decisionContext = analysisPackage?.decisionContext;
  const decisionContextLine = decisionContext?.applies ? formatDecisionContextSummary(decisionContext) : "";
  const reasons = [
    "\u5f53\u524d\u53ef\u89c1\u4fe1\u606f\u9650\u5236\uff1a\u53ea\u57fa\u4e8e\u5f53\u524d\u5149\u6807\u4e4b\u524d\u7684\u53ef\u89c1\u4fe1\u606f\uff0c\u4e0d\u8bfb\u53d6\u672a\u6765\u4e8b\u4ef6\u6216\u724c\u5c71\u3002",
    ...(decisionContextLine ? [decisionContextLine] : []),
    topEngine ? "\u5f53\u524d\u63a8\u8350\u7b2c\u4e00\u5019\u9009\u662f" + topEngine.label + "\uff0c\u53ef\u4ee5\u5148\u628a\u5b83\u5f53\u4f5c\u4e3b\u53c2\u8003\u3002" : "\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7684\u63a8\u8350\u5019\u9009\uff0c\u5148\u7528\u53ef\u89c1\u724c\u9762\u548c\u724c\u6548\u505a\u57fa\u7840\u5224\u65ad\u3002",
    topEfficiency ? "\u724c\u6548\u4fa7\u7b2c\u4e00\u5019\u9009\uff1a" + topEfficiency.label : "\u5f53\u524d\u624b\u724c\u5f20\u6570\u6682\u4e0d\u9002\u5408\u505a\u5b8c\u6574\u5411\u542c\u002f\u53d7\u5165\u6392\u5e8f\u3002",
  ];
  const risks = [
    ...(safetyHints.length ? safetyHints.slice(0, 2).map((hint) => `${formatTileName(hint.tile)}：${hint.labels.join("；")}`) : ["没有明显立直现物压力时，也要留意宝牌周边和副露家手役速度。"]),
    ...(decisionContext?.applies ? decisionContext.notes.slice(0, 1) : []),
    ...llm.warnings.slice(0, 1),
  ].filter(Boolean);
  const evidence = [
    `${snapshot.round.title}，光标 ${snapshot.cursor}/${snapshot.maxCursor}`,
    `目标 ${target?.name ?? `seat ${snapshot.targetSeat}`}，手牌 ${formatTileNames(snapshot.targetHand) || "暂无"}`,
    `宝牌指示牌 ${formatTileNames(snapshot.doraIndicators) || "暂无"}`,
    ...(decisionContext?.applies ? [decisionContextLine] : []),
  ];

  return {
    conclusion: topEngine ? `先按 ${topEngine.label} 作为主线理解，再结合牌效和安全线索取舍。` : buildHeuristicAnswer(question, snapshot).split("\n\n")[0],
    reasons: reasons.slice(0, 4),
    risks: risks.slice(0, 3),
    suggestedQuestions: ["这一步应该押还是降？", "候选切牌怎么排序？", "这张牌对立直家安全吗？"],
    evidence,
  };
}

function formatStructuredChatAnswer(structured: AnalysisChatStructured) {
  const sections = [structured.conclusion.trim()];
  const reasons = structured.reasons.slice(0, 3);

  if (reasons.length) {
    sections.push(`理由：${reasons.join("；")}`);
  }

  return sections.join("\n\n");
}

function formatRecommendationForUser(recommendation: AnalysisEngineResult["recommendations"][number]) {
  const actionText: Record<string, string> = {
    discard: "切",
    riichi: "立直",
    pass: "跳过",
    chi: "吃",
    pon: "碰",
    kan: "杠",
    win: "和牌",
  };
  const score = typeof recommendation.probability === "number" ? `（${Math.round(recommendation.probability * 100)}%）` : "";

  return `${actionText[recommendation.action] ?? recommendation.action}${recommendation.tile ? ` ${formatTileName(recommendation.tile)}` : ""}${score}`;
}

function formatShanten(value: number) {
  if (value < 0) {
    return value === -1 ? "听牌" : "已和牌";
  }

  return `${value} 向听`;
}

function roundWindFromIndex(index: number): "E" | "S" | "W" | "N" {
  return (["E", "S", "W", "N"] as const)[index] ?? "E";
}

function buildHeuristicAnswer(question: string, snapshot: VisibleAnalysisSnapshot) {
  const target = snapshot.players.find((player) => player.seat === snapshot.targetSeat);
  const lowerQuestion = question.toLowerCase();
  const visibleSummary = summarizeSnapshot(snapshot);
  const targetRiver = snapshot.discards[snapshot.targetSeat];
  const opponentDiscards = ([0, 1, 2, 3] as PlaybackSeat[])
    .filter((seat) => seat !== snapshot.targetSeat)
    .flatMap((seat) => snapshot.discards[seat]);
  const latestOpponentDiscards = ([0, 1, 2, 3] as PlaybackSeat[])
    .filter((seat) => seat !== snapshot.targetSeat)
    .map((seat) => {
      const player = snapshot.players.find((item) => item.seat === seat);
      const river = snapshot.discards[seat];
      return `${player?.name ?? seat}: ${formatTileNames(river.slice(-3)) || "暂无切牌"}`;
    });
  const hasRiichi = ([0, 1, 2, 3] as PlaybackSeat[]).some((seat) => snapshot.riichiTiles[seat].length > 0 && seat !== snapshot.targetSeat);
  const visibleTiles = [...targetRiver, ...opponentDiscards];
  const safeHints = latestOpponentDiscards.join("；");
  const doraText = formatTileNames(snapshot.doraIndicators) || "暂无";
  const currentText = snapshot.currentEventText || "起手状态";

  if (/(危险|危険|safe|安牌|铳|放铳|对手|读牌)/i.test(lowerQuestion)) {
    return [
      `基于当前可见信息，点位是 ${snapshot.round.title} 的 ${snapshot.cursor}/${snapshot.maxCursor}，目标玩家 ${target?.name ?? `seat ${snapshot.targetSeat}`}。`,
      hasRiichi
        ? "场上已经能看到立直宣言，优先从现物、最近巡目共同安全信息和目标手牌价值之间做取舍。"
        : "目前快照里没有对手立直记录，危险度主要看副露、宝牌周边和各家最近切牌节奏。",
      `对手最近切牌：${safeHints}。这些只是可见牌线索，不等于完整安全牌集合。`,
      `已见切牌共 ${visibleTiles.length} 张，宝牌指示牌 ${doraText}。涉及宝牌或宝牌周边的选择需要更保守。`,
    ].join("\n\n");
  }

  if (/(怎么打|何切|切什么|打哪|选择|进攻|防守|押|降)/i.test(question)) {
    const drawnText = snapshot.drawnTile ? `，当前摸牌 ${formatTileName(snapshot.drawnTile)}` : "";
    return [
      `基于当前可见信息，我会先把这一手拆成“手牌价值、速度、风险”三件事看：目标手牌 ${formatTileNames(snapshot.targetHand) || "暂无"}${drawnText}。`,
      `当前事件：${currentText}。如果这是目标玩家出牌点，优先比较手里孤张、重复牌、宝牌相关牌和已见张数；如果不是目标玩家回合，先观察对手副露与立直压力。`,
      `宝牌指示牌是 ${doraText}。第一版不会计算完整向听数，所以我不会假装给出唯一最优切牌；更稳妥的做法是把候选牌按“是否破坏面子/搭子、是否靠近宝牌、是否是现物或筋牌线索”排序。`,
      `可见摘要：${visibleSummary.join("；")}。`,
    ].join("\n\n");
  }

  if (/(宝牌|dora|手牌|形|向听|进张|牌效)/i.test(question)) {
    return [
      `目标手牌：${formatTileNames(snapshot.targetHand) || "暂无"}${snapshot.drawnTile ? `；摸牌：${formatTileName(snapshot.drawnTile)}` : ""}。`,
      `宝牌指示牌：${doraText}。注意这里展示的是指示牌，不是实际宝牌枚举。`,
      `目标牌河：${targetRiver.join(" ") || "暂无切牌"}。如果目标已经切过某一色的中张，后续再讨论那一色的搭子价值时要打折。`,
      "第一版只做可见结构分析，不展开未来牌山，也不会读取未发生的摸牌。需要精确向听/进张时，后续可以把专业牌效引擎接到同一份快照上。",
    ].join("\n\n");
  }

  return [
    `我按当前光标 ${snapshot.cursor}/${snapshot.maxCursor} 来看，不使用后续牌谱。`,
    `当前事件：${currentText}。`,
    `目标玩家 ${target?.name ?? `seat ${snapshot.targetSeat}`} 手牌：${formatTileNames(snapshot.targetHand) || "暂无"}${snapshot.drawnTile ? `，摸牌 ${formatTileName(snapshot.drawnTile)}` : ""}。`,
    `四家牌河：${([0, 1, 2, 3] as PlaybackSeat[])
      .map((seat) => {
        const player = snapshot.players.find((item) => item.seat === seat);
        return `${player?.name ?? seat} ${formatTileNames(snapshot.discards[seat]) || "-"}`;
      })
      .join("；")}。`,
    `你问的是“${question}”。如果要我进一步聚焦，可以问“这一步押还是降”“候选切牌怎么排”或“对某一家怎么读”。`,
  ].join("\n\n");
}

function sanitizeSnapshot(snapshot: VisibleAnalysisSnapshot): VisibleAnalysisSnapshot {
  return {
    source: {
      id: snapshot.source.id,
      region: snapshot.source.region,
    },
    round: { ...snapshot.round },
    cursor: snapshot.cursor,
    maxCursor: snapshot.maxCursor,
    targetSeat: snapshot.targetSeat,
    players: snapshot.players.map((player) => ({ ...player, name: `${player.wind} seat ${player.seat}` })),
    doraIndicators: [...snapshot.doraIndicators],
    targetHand: [...snapshot.targetHand],
    drawnTile: snapshot.drawnTile,
    discards: copySeatTiles(snapshot.discards),
    calls: {
      0: snapshot.calls[0].map(copyVisibleCall),
      1: snapshot.calls[1].map(copyVisibleCall),
      2: snapshot.calls[2].map(copyVisibleCall),
      3: snapshot.calls[3].map(copyVisibleCall),
    },
    riichiTiles: copySeatTiles(snapshot.riichiTiles),
    currentEvent: snapshot.currentEvent ? sanitizeRoundEvent(snapshot.currentEvent) : undefined,
    currentEventText: snapshot.currentEventText,
    previousEventText: snapshot.previousEventText,
    roundResult: snapshot.roundResult,
  };
}

function sanitizeVisibleEvents(events: RoundEvent[] | undefined, cursor: number) {
  return (events ?? []).slice(0, Math.max(0, cursor)).map(sanitizeRoundEvent);
}

function sanitizeRoundEvent(event: RoundEvent): RoundEvent {
  if (event.type === "new-round") {
    return { type: "new-round", seat: event.seat, label: event.label };
  }

  if (event.type === "draw") {
    return { type: "draw", seat: event.seat, tile: event.tile, leftTileCount: event.leftTileCount, doraIndicators: event.doraIndicators ? [...event.doraIndicators] : undefined };
  }

  if (event.type === "discard") {
    return { type: "discard", seat: event.seat, tile: event.tile, moqie: event.moqie, riichi: event.riichi };
  }

  if (event.type === "call") {
    return { type: "call", seat: event.seat, callType: event.callType, tiles: [...event.tiles], froms: [...event.froms] };
  }

  if (event.type === "kan") {
    return { type: "kan", seat: event.seat, callType: event.callType, tiles: [...event.tiles], doraIndicators: event.doraIndicators ? [...event.doraIndicators] : undefined };
  }

  if (event.type === "agari") {
    return { type: "agari", seat: event.seat, zimo: event.zimo, tile: event.tile, title: event.title, point: event.point };
  }

  return { type: "ryukyoku", label: event.label };
}

function unavailableEngine(message: string): AnalysisEngineResult {
  return {
    status: "unavailable",
    recommendations: [],
    warnings: [message],
  };
}

function summarizeSnapshot(snapshot: VisibleAnalysisSnapshot) {
  const target = snapshot.players.find((player) => player.seat === snapshot.targetSeat);

  return [
    `${snapshot.round.title}，光标 ${snapshot.cursor}/${snapshot.maxCursor}`,
    `目标 ${target?.name ?? `seat ${snapshot.targetSeat}`}，手牌 ${snapshot.targetHand.length} 张`,
    `宝牌指示牌 ${formatTileNames(snapshot.doraIndicators) || "暂无"}`,
    `当前事件 ${snapshot.currentEventText}`,
  ];
}

function formatVisibleEvent(event: RoundEvent, players: Player[]) {
  if (event.type === "new-round") {
    return event.label;
  }

  if (event.type === "draw") {
    return `${seatName(event.seat, players)} 摸 ${formatTileName(event.tile)}`;
  }

  if (event.type === "discard") {
    return `${seatName(event.seat, players)} 切 ${formatTileName(event.tile)}${event.moqie ? "（摸切）" : ""}${event.riichi ? "，立直" : ""}`;
  }

  if (event.type === "call" || event.type === "kan") {
    return `${seatName(event.seat, players)} ${event.callType} ${formatTileNames(event.tiles)}`;
  }

  if (event.type === "agari") {
    return `${seatName(event.seat, players)} ${event.zimo ? "自摸" : "荣和"} ${event.title} ${event.point || ""}`.trim();
  }

  return event.label;
}

function seatName(seat: number, players: Player[]) {
  const player = players[seat];
  return player ? `${player.wind} ${player.name}` : `seat ${seat}`;
}

function copySeatTiles<T>(record: Record<PlaybackSeat, T[]>): Record<PlaybackSeat, T[]> {
  return {
    0: [...record[0]],
    1: [...record[1]],
    2: [...record[2]],
    3: [...record[3]],
  };
}

function copySeatCalls(record: PlaybackState["calls"]): Record<PlaybackSeat, VisibleAnalysisCall[]> {
  return {
    0: record[0].map(copyCall),
    1: record[1].map(copyCall),
    2: record[2].map(copyCall),
    3: record[3].map(copyCall),
  };
}

function copyCall(call: PlaybackState["calls"][PlaybackSeat][number]): VisibleAnalysisCall {
  return {
    seat: call.seat,
    callType: call.callType,
    tiles: [...call.tiles],
    froms: call.froms ? [...call.froms] : undefined,
    eventIndex: call.eventIndex,
  };
}

function copyVisibleCall(call: VisibleAnalysisCall): VisibleAnalysisCall {
  return {
    ...call,
    tiles: [...call.tiles],
    froms: call.froms ? [...call.froms] : undefined,
  };
}
