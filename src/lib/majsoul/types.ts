export type MahjongSoulRegion = "cn" | "jp" | "en";
export type MjsoulRegion = MahjongSoulRegion | "tenhou" | "riichi-city";
export type PaipuProvider = "majsoul" | "tenhou" | "riichi-city";

export type PaipuSource = {
  id: string;
  url: string;
  region: MjsoulRegion;
  provider?: PaipuProvider;
  targetSeat?: 0 | 1 | 2 | 3;
};

export type RoundEvent =
  | { type: "new-round"; seat: number; label: string }
  | { type: "draw"; seat: number; tile: string; leftTileCount?: number; doraIndicators?: string[] }
  | { type: "discard"; seat: number; tile: string; moqie: boolean; riichi: boolean }
  | { type: "call"; seat: number; callType: string; tiles: string[]; froms: number[] }
  | { type: "kan"; seat: number; callType: string; tiles: string[]; doraIndicators?: string[] }
  | { type: "agari"; seat: number; zimo: boolean; tile: string; title: string; point: number }
  | { type: "ryukyoku"; label: string };

export type Player = {
  seat: 0 | 1 | 2 | 3;
  wind: "E" | "S" | "W" | "N";
  name: string;
  accountId?: number;
  rank?: string;
  startScore: number;
  finalScore?: number;
  score: string;
  style: string;
};

export type RoundWall = {
  source: "paishan";
  tiles: string[];
  rawLength: number;
  complete: boolean;
  md5?: string;
};

export type Round = {
  id: string;
  title: string;
  windRound: number;
  roundNumber: number;
  honba: number;
  riichiSticks: number;
  dealer: string;
  result: string;
  scoreDelta: string;
  focus: string;
  danger: "low" | "mid" | "high";
  startScores: number[];
  endScores?: number[];
  doraIndicators: string[];
  initialHands: Record<number, string[]>;
  discards: Record<number, string[]>;
  calls: string[];
  events: RoundEvent[];
  wall?: RoundWall;
};

export type Analysis = {
  title: string;
  confidence: number;
  summary: string;
  keyMoments: string[];
  suggestions: string[];
};

export type AnalyzeDebugStageName =
  | "source"
  | "connect"
  | "login"
  | "fetch-record"
  | "read-game-record"
  | "parse-record"
  | "normalize";

export type AnalyzeDebugStage = {
  name: AnalyzeDebugStageName;
  status: "ok" | "error";
  durationMs: number;
  message?: string;
  upstreamError?: MjsoulUpstreamError;
};

export type MjsoulUpstreamError = {
  code?: number;
  message?: string;
  desc?: string;
  dataKeys?: string[];
  u32Params?: number[];
  strParams?: string[];
  hasJsonParam?: boolean;
};

export type AnalyzeDebug = {
  enabled: true;
  startedAt: string;
  durationMs: number;
  source?: {
    id: string;
    region: MjsoulRegion;
    provider?: PaipuProvider;
    targetSeat?: 0 | 1 | 2 | 3;
  };
  recordSource?: "data" | "data_url" | "record-v2";
  network?: {
    proxy: "none" | "configured";
    attempts: Array<{
      gatewayUrl: string;
      status: "ok" | "error";
      message?: string;
      durationMs: number;
    }>;
  };
  recordCounts?: Record<string, number>;
  recordsTotal?: number;
  headShape?: {
    keys: string[];
    configKeys: string[];
    modeKeys: string[];
    detailRuleKeys: string[];
    accountCount: number;
  };
  players?: Array<{
    seat: number;
    nickname: string;
  }>;
  normalize?: {
    rounds: number;
    eventCount: number;
    unsupportedReason?: string;
    doraChanges?: Array<{
      roundId: string;
      roundTitle: string;
      eventIndex: number;
      record: "RecordNewRound" | "RecordDealTile" | "RecordAnGangAddGang" | "paishan";
      source: "record" | "paishan";
      doraIndicators: string[];
    }>;
    walls?: Array<{
      roundId: string;
      roundTitle: string;
      source: "paishan";
      rawLength: number;
      tileCount: number;
      complete: boolean;
      hasMd5: boolean;
    }>;
  };
  stages: AnalyzeDebugStage[];
  error?: {
    code: AnalyzeErrorCode;
    message: string;
    upstream?: MjsoulUpstreamError;
  };
};

export type AnalyzeSuccess = {
  source: PaipuSource;
  players: Player[];
  rounds: Round[];
  selectedRound: Round | null;
  targetSeat: 0 | 1 | 2 | 3;
  analysis: Analysis;
  debug?: AnalyzeDebug;
};

export type VisibleAnalysisPlayer = {
  seat: 0 | 1 | 2 | 3;
  wind: Player["wind"];
  name: string;
  score: string;
  startScore: number;
  style: string;
};

export type VisibleAnalysisCall = {
  seat: 0 | 1 | 2 | 3;
  callType: string;
  tiles: string[];
  froms?: number[];
  eventIndex: number;
};

export type VisibleAnalysisSnapshot = {
  source: Pick<PaipuSource, "id" | "region">;
  round: {
    id: string;
    title: string;
    windRound: number;
    roundNumber: number;
    honba: number;
    riichiSticks: number;
    dealer: string;
    danger: Round["danger"];
  };
  cursor: number;
  maxCursor: number;
  targetSeat: 0 | 1 | 2 | 3;
  players: VisibleAnalysisPlayer[];
  doraIndicators: string[];
  targetHand: string[];
  drawnTile?: string;
  discards: Record<0 | 1 | 2 | 3, string[]>;
  calls: Record<0 | 1 | 2 | 3, VisibleAnalysisCall[]>;
  riichiTiles: Record<0 | 1 | 2 | 3, number[]>;
  currentEvent?: RoundEvent;
  currentEventText: string;
  previousEventText?: string;
  roundResult?: string;
};

export type AnalysisChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  snapshotKey: string;
  structured?: AnalysisChatStructured;
};

export type AnalysisChatRequest = {
  question: string;
  snapshot: VisibleAnalysisSnapshot;
  mode?: "current-hand";
  llmModel?: AnalysisLlmModelChoice;
  visibleEvents?: RoundEvent[];
};

export type AnalysisChatResponse = {
  answer: string;
  snapshotKey: string;
  engine: AnalysisEngineResult;
  llm: AnalysisLlmResult;
  visibleSummary: string[];
  warnings: string[];
  structured?: AnalysisChatStructured;
};

export type AnalysisContext = {
  mode: "current-hand";
  question: string;
  snapshot: VisibleAnalysisSnapshot;
  visibleEvents: RoundEvent[];
  visibleSummary: string[];
  analysisPackage?: CurrentHandAnalysisPackage;
  decisionContext?: AnalysisDecisionContext;
};

export type AnalysisEvidenceItem = {
  id: string;
  kind: "snapshot" | "engine" | "tileEfficiency" | "offensiveEv" | "safety" | "routeFactor" | "comparison" | "knowledgeCase" | "decisionContext" | "tableInference";
  text: string;
  source?: {
    title: string;
    url?: string;
  };
};

export type AnalysisChatStructured = {
  conclusion: string;
  reasons: string[];
  risks: string[];
  suggestedQuestions: string[];
  evidence: string[];
  evidenceIds?: string[];
  directReplies?: string[];
  correctionsAccepted?: string[];
};

export type AnalysisIntent =
  | "discard_choice"
  | "compare_candidate_discards"
  | "safety_check"
  | "tile_efficiency"
  | "dora_explanation"
  | "placement_strategy"
  | "user_correction"
  | "general_review";

export type AnalysisFactorPriority = "correction" | "placement" | "endgame" | "efficiency" | "safety" | "dora";

export type AnalysisErrorCategory =
  | "user_correction"
  | "placement_endgame"
  | "defense_priority"
  | "future_dora_tiebreak"
  | "efficiency_priority"
  | "single_candidate_scope"
  | "general";

export type AnalysisErrorProfile = {
  category: AnalysisErrorCategory;
  priorityOrder: AnalysisFactorPriority[];
  requiredCues: string[];
  notes: string[];
};

export type AnalysisToolName = "engine" | "tileEfficiency" | "offensiveEv" | "safetyHints" | "routeFactors" | "doraAnalysis" | "candidateComparison" | "knowledgeCases";

export type AnalysisToolPlan = {
  intent: AnalysisIntent;
  tools: AnalysisToolName[];
  focusTiles: string[];
  answerMode: "direct" | "explain" | "teach" | "correct";
  userCorrection: boolean;
};

export type AnalysisKnowledgeCase = {
  id: string;
  intent: AnalysisIntent;
  triggerTiles: string[];
  ruleTags: string[];
  matchKeywords?: string[];
  conditions?: string[];
  positiveExplanation: string;
  negativeClaims: string[];
  requiredFacts: string[];
  sources?: {
    title: string;
    url: string;
    note?: string;
  }[];
};

export type AnalysisDecisionContext = {
  applies: boolean;
  mode: "normal" | "placement" | "endgame";
  tableWind: string;
  tableWindLabel: string;
  roundLabel: string;
  honba: number;
  riichiSticks: number;
  targetRank: number;
  targetScore: number;
  leaderScore: number;
  gapToLeader: number;
  gapToThird?: number;
  gapToFourth?: number;
  scoreSummary: string;
  requiredFacts: string[];
  notes: string[];
};

export type DoraTileFact = {
  tile: string;
  indicator: string;
  visibleIndicatorCount: number;
  remainingIndicatorCount: number;
  currentDoraCount: number;
  labels: string[];
};

export type DoraAnalysis = {
  doraIndicators: string[];
  currentDoraTiles: string[];
  visibleCounts: Record<string, number>;
  candidateFacts: DoraTileFact[];
  notes: string[];
};

export type RouteFactorKind = "tanyao" | "yakuhai" | "honitsu" | "chiitoi";

export type RouteFactorStrength = "weak" | "medium" | "strong";

export type RouteFactor = {
  route: RouteFactorKind;
  strength: RouteFactorStrength;
  evidence: string[];
  lostByDiscard?: string;
};

export type RouteFactorAnalysis = {
  discard: string;
  routes: RouteFactor[];
};

export type CandidateComparison = {
  left: string;
  right: string;
  sameEfficiency: boolean;
  sameSafety: boolean;
  mortalRanks: Record<string, number | null>;
  preferredKeepTile?: string;
  preferredDiscardTile?: string;
  decidingFactors: Array<{
    type: "future-dora-potential" | "current-dora" | "safety" | "efficiency" | "route-factor" | "engine";
    strength?: "strong" | "medium" | "weak";
    summary: string;
    preferredKeepTile?: string;
    preferredDiscardTile?: string;
  }>;
  counterfactualSummary?: {
    engineOrder: string;
    boundary?: string;
    factors: Array<{
      id: "efficiency" | "safety" | "dora" | "route" | "offensiveEv";
      label: string;
      verdict: string;
      evidence: string[];
      relationToEngine: "supports" | "opposes" | "inconclusive";
      strength?: "strong" | "medium" | "weak";
      preferredDiscardTile?: string;
    }>;
  };
};

export type AnalysisPackageRecommendation = {
  rank: number;
  action: AnalysisEngineAction;
  tile?: string;
  label: string;
  probability?: number;
  tags: string[];
  safety?: {
    tone: "safe" | "caution" | "neutral";
    labels: string[];
    description: string;
  };
};

export type AnalysisTableInferenceContext = {
  applies: boolean;
  reason: string;
  allowedUse: "supplement-only";
  focusTiles: string[];
  guardrails: string[];
  visibleTable: {
    round: string;
    cursor: string;
    targetSeat: number;
    targetHand: string[];
    drawnTile?: string;
    doraIndicators: string[];
    players: {
      seat: number;
      wind: VisibleAnalysisPlayer["wind"];
      score: string;
      style: string;
    }[];
    discards: Record<0 | 1 | 2 | 3, string[]>;
    calls: Record<0 | 1 | 2 | 3, string[]>;
    riichiSeats: number[];
    recentEvents: string[];
  };
};

export type CurrentHandAnalysisPackage = {
  intent?: AnalysisIntent;
  toolPlan?: AnalysisToolPlan;
  decisionContext?: AnalysisDecisionContext;
  errorProfile?: AnalysisErrorProfile;
  doraAnalysis?: DoraAnalysis;
  candidateComparisons?: CandidateComparison[];
  knowledgeCases?: AnalysisKnowledgeCase[];
  evidenceCatalog?: AnalysisEvidenceItem[];
  tableInference?: AnalysisTableInferenceContext;
  routeFactors?: {
    topDiscards: RouteFactorAnalysis[];
    message?: string;
  };
  readonlyNotice: string;
  hand: {
    tiles: string[];
    drawnTile?: string;
    doraIndicators: string[];
  };
  engine: {
    status: AnalysisEngineResult["status"];
    topRecommendations: AnalysisPackageRecommendation[];
    warnings: string[];
  };
  tileEfficiency: {
    status: "empty" | "unsupported" | "ready";
    tileCount: number;
    shanten: number;
    standardShanten: number;
    sevenPairsShanten: number;
    thirteenOrphansShanten: number;
    topDiscards: {
      discard: string;
      label: string;
      shantenAfterDiscard: number;
      waitCount: number;
      waits: string[];
    }[];
    message?: string;
  };
  offensiveEv?: {
    status: "empty" | "unsupported" | "ready";
    topDiscards: {
      discard: string;
      label: string;
      shantenAfterDiscard: number;
      ukeire: number;
      waitCount: number;
      averageScore: number;
      offensiveEv: number;
      waits: string[];
      furitenWaits: string[];
      branches: string[];
      notes: string[];
    }[];
    message?: string;
  };
  safety: {
    riichiSeats: number[];
    candidateHints: {
      tile: string;
      tone: "safe" | "caution" | "neutral";
      labels: string[];
      description: string;
    }[];
  };
};

export type AnalysisEngineAction = "discard" | "riichi" | "pass" | "chi" | "pon" | "kan" | "win";

export type AnalysisEngineRecommendation = {
  action: AnalysisEngineAction;
  tile?: string;
  rank: number;
  score?: number;
  probability?: number;
  tags: string[];
  displayLabel?: string;
  targetTiles?: string[];
};

export type AnalysisEngineResult = {
  status: "available" | "unavailable";
  recommendations: AnalysisEngineRecommendation[];
  warnings: string[];
};

export type DecisionPoint = {
  roundId: string;
  cursor: number;
  seat: 0 | 1 | 2 | 3;
  kind: "draw" | "reaction";
  drawnTile?: string;
  reactionTile?: string;
  triggerSeat?: 0 | 1 | 2 | 3;
  actualAction: AnalysisEngineAction;
  actualTile?: string;
  actualEventCursor: number;
  snapshotKey: string;
};

export type EngineOverlay = {
  snapshotKey: string;
  status: "idle" | "loading" | "available" | "unavailable";
  recommendations: AnalysisEngineRecommendation[];
  topRecommendation?: AnalysisEngineRecommendation;
  warnings: string[];
  updatedAt?: number;
};

export type DecisionDifferenceStatus = "pending" | "same" | "different" | "engine-unavailable" | "not-comparable";

export type DecisionDifference = {
  point: DecisionPoint;
  status: DecisionDifferenceStatus;
  topRecommendation?: AnalysisEngineRecommendation;
  reason?: string;
};

export type SimulationBranch = {
  id: string;
  baseRoundId: string;
  baseCursor: number;
  seat: 0 | 1 | 2 | 3;
  replacementAction: AnalysisEngineAction;
  replacementTile?: string;
  events: RoundEvent[];
  wallPolicy: "original-future-sequence" | "engine-generated" | "unknown";
  label: string;
  status: "planned" | "experimental" | "complete";
};

export type AnalysisLlmResult = {
  provider: "openai-compatible" | "heuristic";
  model: string | null;
  status: "available" | "unavailable";
  failureReason?: "timeout" | "gateway-error" | "empty-response" | "missing-config" | "request-error";
  tokensUsed?: number | null;
  warnings: string[];
};

export type AnalysisLlmModelChoice = "flash" | "pro";

export type AnalyzeErrorCode =
  | "BAD_REQUEST"
  | "CONFIG_MISSING"
  | "YOSTAR_BAD_RESPONSE"
  | "YOSTAR_CODE_FAILED"
  | "YOSTAR_CODE_INVALID"
  | "YOSTAR_LOGIN_FAILED"
  | "YOSTAR_REQUEST_FAILED"
  | "YOSTAR_SESSION_FAILED"
  | "YOSTAR_SUBMIT_FAILED"
  | "LOGIN_FAILED"
  | "NOT_FOUND"
  | "UNSUPPORTED_GAME"
  | "FETCH_FAILED"
  | "PARSE_FAILED";

export class AnalyzeError extends Error {
  constructor(
    public code: AnalyzeErrorCode,
    message: string,
    public status = 400,
    public debug?: AnalyzeDebug,
    public upstream?: MjsoulUpstreamError,
  ) {
    super(message);
    this.name = "AnalyzeError";
  }
}

export type RawMjsoulRecord = {
  name: string;
  data: Record<string, unknown>;
};

export type RawMjsoulGame = {
  head?: Record<string, unknown>;
  records: RawMjsoulRecord[];
};
