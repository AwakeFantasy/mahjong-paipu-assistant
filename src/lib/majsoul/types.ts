export type MjsoulRegion = "cn" | "jp" | "en";

export type PaipuSource = {
  id: string;
  url: string;
  region: MjsoulRegion;
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
};

export type AnalysisContext = {
  mode: "current-hand";
  question: string;
  snapshot: VisibleAnalysisSnapshot;
  visibleEvents: RoundEvent[];
  visibleSummary: string[];
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
  tokensUsed?: number | null;
  warnings: string[];
};

export type AnalysisLlmModelChoice = "flash" | "pro";

export type AnalyzeErrorCode =
  | "BAD_REQUEST"
  | "CONFIG_MISSING"
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
