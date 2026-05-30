import { spawn } from "node:child_process";

export type MahjongScoreKind = "ron" | "tsumo";

export type MahjongScoreMeld = {
  type: "chi" | "pon" | "kan" | "shouminkan" | "ankan";
  tiles: string[];
  opened?: boolean;
};

export type MahjongScoreRequest = {
  kind: MahjongScoreKind;
  isTsumo?: boolean;
  tiles: string[];
  winTile: string;
  melds?: MahjongScoreMeld[];
  doraIndicators?: string[];
  uraDoraIndicators?: string[];
  roundWind?: "E" | "S" | "W" | "N";
  seatWind?: "E" | "S" | "W" | "N";
  allowRiichi?: boolean;
  hasOpenTanyao?: boolean;
  hasAkaDora?: boolean;
  kyoutakuNumber?: number;
  tsumiNumber?: number;
};

export type MahjongScoreResponse = {
  valid: boolean;
  kind: MahjongScoreKind;
  point: number;
  han?: number;
  fu?: number;
  yaku?: string[];
  error?: string;
  main?: number;
  additional?: number;
  total?: number;
};

type PendingCall = {
  resolve: (value: MahjongScoreResponse | null) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

class MahjongScoreWorker {
  private child: ReturnType<typeof spawn> | null = null;
  private buffer = "";
  private stderr = "";
  private nextId = 1;
  private pending = new Map<string, PendingCall>();
  private ready = false;
  private available = true;
  private startPromise: Promise<void> | null = null;

  async score(request: MahjongScoreRequest): Promise<MahjongScoreResponse | null> {
    if (!this.available) {
      return null;
    }

    try {
      await this.start();
    } catch {
      this.available = false;
      return null;
    }

    if (!this.available) {
      this.stop();
      return null;
    }

    if (!this.child || this.child.killed) {
      this.available = false;
      return null;
    }

    const child = this.child;
    const stdin = child.stdin;
    if (!stdin) {
      this.available = false;
      return null;
    }

    return new Promise((resolve, reject) => {
      const id = String(this.nextId++);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.stop();
        resolve(null);
      }, 15000);

      this.pending.set(id, { resolve, reject, timer });
      stdin.write(JSON.stringify({ id, command: "score", payload: request }) + "\n", (error) => {
        if (!error) {
          return;
        }

        clearTimeout(timer);
        this.pending.delete(id);
        this.stop();
        resolve(null);
      });
    });
  }

  private async start() {
    if (this.ready && this.child && !this.child.killed) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise((resolve, reject) => {
      const command = parseWorkerCommand();
      const child = spawn(command.command, command.args, { windowsHide: true });
      this.child = child;
      this.buffer = "";
      this.stderr = "";

      const startupTimer = setTimeout(() => {
        this.stop();
        reject(new Error("mahjong score worker startup timed out"));
      }, 10000);

      child.stdout.on("data", (chunk) => {
        this.buffer += chunk.toString();
        this.consumeStdout();
      });
      child.stderr.on("data", (chunk) => {
        this.stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(startupTimer);
        this.startPromise = null;
        this.ready = false;
        this.available = false;
        this.rejectAll(error);
        reject(error);
      });
      child.on("close", () => {
        clearTimeout(startupTimer);
        this.startPromise = null;
        this.ready = false;
        this.child = null;
        this.rejectAll(new Error(this.stderr.trim() || "mahjong score worker exited"));
      });

      this.consumeStdout();
      const readyCheck = setInterval(() => {
        if (this.ready) {
          clearInterval(readyCheck);
          clearTimeout(startupTimer);
          this.startPromise = null;
          resolve();
        }
      }, 10);
    });

    return this.startPromise;
  }

  private consumeStdout() {
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) {
        this.handleLine(line);
      }
      index = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string) {
    const payload = safeJson(line);
    if (!payload) {
      return;
    }

    if (payload.type === "ready") {
      this.ready = true;
      this.available = Boolean(payload.available ?? true);
      return;
    }

    const id = typeof payload.id === "string" ? payload.id : null;
    const pending = id ? this.pending.get(id) : null;

    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (payload.error) {
      this.available = false;
      pending.resolve(null);
      this.stop();
      return;
    }

    const result = payload.result && typeof payload.result === "object" ? normalizeResult(payload.result) : null;
    pending.resolve(result);
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    this.pending.clear();
  }

  private stop() {
    if (this.child && !this.child.killed) {
      this.child.kill();
    }

    this.child = null;
    this.ready = false;
  }
}

let worker: MahjongScoreWorker | null = null;
const requestCache = new Map<string, Promise<MahjongScoreResponse | null>>();
const MAX_REQUEST_CACHE_SIZE = 128;

export async function scoreWinningHand(request: MahjongScoreRequest): Promise<MahjongScoreResponse | null> {
  const key = JSON.stringify(request);
  const cached = getCachedRequest(key);
  if (cached) {
    return cached;
  }

  if (!worker) {
    worker = new MahjongScoreWorker();
  }

  const promise = worker.score(request).catch(() => null);
  setCachedRequest(key, promise);
  const result = await promise;
  if (!result) {
    requestCache.delete(key);
  }

  return result;
}

function getCachedRequest(key: string) {
  const cached = requestCache.get(key);
  if (!cached) {
    return null;
  }

  requestCache.delete(key);
  requestCache.set(key, cached);
  return cached;
}

function setCachedRequest(key: string, promise: Promise<MahjongScoreResponse | null>) {
  if (requestCache.has(key)) {
    requestCache.delete(key);
  }

  requestCache.set(key, promise);
  while (requestCache.size > MAX_REQUEST_CACHE_SIZE) {
    const oldestKey = requestCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }

    requestCache.delete(oldestKey);
  }
}

function parseWorkerCommand() {
  const pythonCommand = process.env.MAHJONG_SCORE_PYTHON?.trim() || "python";
  return {
    command: pythonCommand,
    args: ["scripts/mahjong-score-worker.py"],
  };
}

function safeJson(line: string) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeResult(payload: Record<string, unknown>): MahjongScoreResponse | null {
  return {
    valid: Boolean(payload.valid),
    kind: payload.kind === "tsumo" ? "tsumo" : "ron",
    point: typeof payload.point === "number" ? payload.point : 0,
    han: typeof payload.han === "number" ? payload.han : undefined,
    fu: typeof payload.fu === "number" ? payload.fu : undefined,
    yaku: Array.isArray(payload.yaku) ? payload.yaku.filter((item): item is string => typeof item === "string") : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
    main: typeof payload.main === "number" ? payload.main : undefined,
    additional: typeof payload.additional === "number" ? payload.additional : undefined,
    total: typeof payload.total === "number" ? payload.total : undefined,
  };
}
