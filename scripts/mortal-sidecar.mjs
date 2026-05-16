import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

loadLocalEnv();

const port = Number(process.env.MORTAL_SIDECAR_PORT || 4010);
const host = process.env.MORTAL_SIDECAR_HOST || "127.0.0.1";
const commandTemplate = process.env.MORTAL_COMMAND_TEMPLATE || "";
const workerCommandTemplate = process.env.MORTAL_WORKER_COMMAND_TEMPLATE || "";
const timeoutMs = positiveInteger(process.env.MORTAL_PROCESS_TIMEOUT_MS, 15000);
const workerTimeoutMs = positiveInteger(process.env.MORTAL_WORKER_TIMEOUT_MS, timeoutMs);
let worker = null;

const MJAI_MASK_LIST = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "E",
  "S",
  "W",
  "N",
  "P",
  "F",
  "C",
  "5mr",
  "5pr",
  "5sr",
  "reach",
  "chi_low",
  "chi_mid",
  "chi_high",
  "pon",
  "kan_select",
  "hora",
  "ryukyoku",
  "none",
];

function loadLocalEnv() {
  const path = ".env.local";

  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");

    process.env[key] ??= value;
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      commandConfigured: Boolean(commandTemplate),
      workerConfigured: Boolean(workerCommandTemplate),
      workerReady: worker?.isReady() ?? false,
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/analyze") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  try {
    const body = await readJson(request);
    const context = body?.context;

    if (!context?.snapshot) {
      sendJson(response, 400, { error: "missing_context" });
      return;
    }

    if (!commandTemplate && !worker) {
      sendJson(response, 503, { recommendations: [], warnings: ["MORTAL_COMMAND_TEMPLATE or MORTAL_WORKER_COMMAND_TEMPLATE is not configured."] });
      return;
    }

    if (!context.snapshot.drawnTile && !isReactionSnapshot(context.snapshot)) {
      sendJson(response, 200, {
        recommendations: [],
        warnings: ["当前光标不是目标玩家摸牌后的出牌决策点；请把进度移动到目标玩家摸牌后、需要切牌的位置，再请求 Mortal 候选动作。"],
      });
      return;
    }

    const mjai = buildMjaiLog(context);
    const actor = String(context.snapshot.targetSeat ?? 0);
    const result = worker
      ? await worker.run({ actor: Number(actor), mjai })
      : await runMortal(commandTemplate.replaceAll("{actor}", actor), mjai);
    sendJson(response, 200, parseMortalOutput(result));
  } catch (error) {
    sendJson(response, 200, {
      recommendations: [],
      warnings: [`Mortal sidecar failed: ${error instanceof Error ? error.message : "unknown error"}`],
    });
  }
});

process.on("exit", () => {
  worker?.stop();
});

server.listen(port, host, () => {
  console.log(`mortal sidecar listening on http://${host}:${port}`);
});

function buildMjaiLog(context) {
  const snapshot = context.snapshot;
  const actor = Number(snapshot.targetSeat ?? 0);
  const visibleEvents = Array.isArray(context.visibleEvents) ? context.visibleEvents : [];
  const hand = Array.isArray(snapshot.targetHand) ? [...snapshot.targetHand] : [];
  const drawnTile = snapshot.drawnTile;
  const tehais = [maskedHand(), maskedHand(), maskedHand(), maskedHand()];
  const actorHand = visibleEvents.length ? reconstructActorInitialHand(snapshot, actor, visibleEvents) : drawnTile ? removeOne(hand, drawnTile) : hand.slice(0, 13);
  const { startHand, initialTsumo } = splitStartHandAndInitialTsumo(actorHand, visibleEvents, actor, drawnTile);
  tehais[actor] = startHand.map(toMjaiTile);
  const dora = toMjaiTile(snapshot.doraIndicators?.[0] || "1m");

  const events = [
    { type: "start_game" },
    {
      type: "start_kyoku",
      bakaze: roundWind(snapshot.round?.windRound),
      dora_marker: dora,
      kyoku: Number(snapshot.round?.roundNumber ?? 0) + 1,
      honba: Number(snapshot.round?.honba ?? 0),
      kyotaku: Number(snapshot.round?.riichiSticks ?? 0),
      oya: Number(snapshot.round?.roundNumber ?? 0) % 4,
      scores: scores(snapshot.players),
      tehais,
    },
  ];

  if (initialTsumo) {
    events.push({ type: "tsumo", actor, pai: toMjaiTile(initialTsumo) });
  }

  if (visibleEvents.length && startHand.length >= 13) {
    events.push(...visibleEvents.flatMap((event) => toMjaiEvents(event)));
    if (drawnTile && !visibleEvents.some((event) => event?.type === "draw" && Number(event.seat) === actor && event.tile === drawnTile)) {
      events.push({ type: "tsumo", actor, pai: toMjaiTile(drawnTile) });
    }
  } else if (drawnTile) {
    events.push({ type: "tsumo", actor, pai: toMjaiTile(drawnTile) });
  } else if (isReactionSnapshot(snapshot)) {
    const event = snapshot.currentEvent;
    events.push({ type: "dahai", actor: Number(event.seat), pai: toMjaiTile(event.tile), tsumogiri: Boolean(event.moqie) });
  }

  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

function splitStartHandAndInitialTsumo(actorHand, visibleEvents, actor, drawnTile) {
  const startHand = [...actorHand];

  if (startHand.length <= 13) {
    return { startHand, initialTsumo: null };
  }

  const firstActorDiscard = visibleEvents.find((event) => event?.type === "discard" && Number(event.seat) === actor)?.tile;
  const initialTsumo = firstActorDiscard && hasTile(startHand, firstActorDiscard) ? firstActorDiscard : drawnTile && hasTile(startHand, drawnTile) ? drawnTile : startHand.at(-1);

  if (initialTsumo) {
    removeOneLoose(startHand, initialTsumo);
  }

  while (startHand.length > 13) {
    startHand.pop();
  }

  return { startHand, initialTsumo };
}

function reconstructActorInitialHand(snapshot, actor, visibleEvents = []) {
  const currentHand = Array.isArray(snapshot.targetHand) ? [...snapshot.targetHand] : [];
  const concealedBeforeDecision = snapshot.drawnTile ? removeOne(currentHand, snapshot.drawnTile) : currentHand.slice();
  const reconstructed = visibleEvents.length
    ? reverseActorEventsToInitialHand(currentHand, visibleEvents, actor)
    : [
        ...concealedBeforeDecision,
        ...seatRecord(snapshot.discards, actor),
        ...seatRecord(snapshot.calls, actor).flatMap((call) => consumedTilesForActor(call, actor)),
      ];

  return reconstructed;
}

function reverseActorEventsToInitialHand(currentConcealedHand, visibleEvents, actor) {
  const hand = [...currentConcealedHand];

  for (let index = visibleEvents.length - 1; index >= 0; index -= 1) {
    const event = visibleEvents[index];

    if (!event || Number(event.seat) !== actor) {
      continue;
    }

    if (event.type === "draw") {
      removeOneLoose(hand, event.tile);
      continue;
    }

    if (event.type === "discard") {
      hand.push(event.tile);
      continue;
    }

    if (event.type === "call" || event.type === "kan") {
      hand.push(...consumedTilesForActor(event, actor));
    }
  }

  return hand;
}

function consumedTilesForActor(call, actor) {
  if (!call || !Array.isArray(call.tiles)) {
    return [];
  }

  if (Array.isArray(call.froms)) {
    return call.tiles.filter((_, index) => Number(call.froms[index]) === actor);
  }

  if (call.type === "kan") {
    return call.tiles;
  }

  return call.seat === actor ? call.tiles : [];
}

function seatRecord(record, seat) {
  return Array.isArray(record?.[seat]) ? record[seat] : Array.isArray(record?.[String(seat)]) ? record[String(seat)] : [];
}

function toMjaiEvents(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  if (event.type === "draw") {
    return [{ type: "tsumo", actor: Number(event.seat), pai: toMjaiTile(event.tile) }];
  }

  if (event.type === "discard") {
    const dahai = { type: "dahai", actor: Number(event.seat), pai: toMjaiTile(event.tile), tsumogiri: Boolean(event.moqie) };
    return event.riichi ? [{ type: "reach", actor: Number(event.seat) }, dahai] : [dahai];
  }

  if (event.type === "call") {
    return [toMjaiCallEvent(event)];
  }

  if (event.type === "kan") {
    return [toMjaiKanEvent(event)];
  }

  return [];
}

function toMjaiCallEvent(event) {
  const actor = Number(event.seat);
  const tiles = Array.isArray(event.tiles) ? event.tiles : [];
  const froms = Array.isArray(event.froms) ? event.froms : [];
  const claimedIndex = froms.findIndex((from) => Number(from) !== actor);
  const target = claimedIndex >= 0 ? Number(froms[claimedIndex]) : actor;
  const pai = tiles[claimedIndex] ?? tiles[0];
  const consumed = tiles.filter((_, index) => Number(froms[index]) === actor).map(toMjaiTile);
  const callType = String(event.callType ?? "");

  if (/\u6760|杠|æ |kan|gang/i.test(callType)) {
    return { type: "daiminkan", actor, target, pai: toMjaiTile(pai), consumed };
  }

  if (/\u5403|吃|å|chi/i.test(callType)) {
    return { type: "chi", actor, target, pai: toMjaiTile(pai), consumed };
  }

  return { type: "pon", actor, target, pai: toMjaiTile(pai), consumed };
}

function toMjaiKanEvent(event) {
  const actor = Number(event.seat);
  const tiles = Array.isArray(event.tiles) ? event.tiles : [];
  const callType = String(event.callType ?? "");
  const consumed = tiles.map(toMjaiTile);

  if (/\u52a0|加|å |鍔犳潬|kakan/i.test(callType)) {
    return { type: "kakan", actor, pai: consumed[0], consumed: [consumed[0], consumed[0], consumed[0]] };
  }

  if (/\u660e|明|æ|daiminkan|minkan/i.test(callType)) {
    return { type: "daiminkan", actor, target: actor, pai: consumed[0], consumed: consumed.slice(1) };
  }

  return { type: "ankan", actor, consumed: expandConcealedKanConsumed(consumed) };
}

function expandConcealedKanConsumed(consumed) {
  if (consumed.length === 1) {
    return [consumed[0], consumed[0], consumed[0], consumed[0]];
  }

  return consumed;
}

function isReactionSnapshot(snapshot) {
  const event = snapshot?.currentEvent;
  return event?.type === "discard" && Number(event.seat) !== Number(snapshot.targetSeat);
}

function parseMortalOutput(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => safeJson(line)).filter(Boolean);
  const action = parsed.at(-1);

  if (!action) {
    return { recommendations: [], warnings: ["Mortal did not return an action."] };
  }

  const recommendations = toRecommendations(action);
  const warnings = ["Mortal sidecar uses current visible snapshot converted to mjai; full-history review can be added later."];

  if (!recommendations.length) {
    return { recommendations: [], warnings };
  }

  return { recommendations, warnings };
}

function toRecommendations(action) {
  const options = metaOptions(action.meta);

  if (options.length) {
    return options
      .map((option, index) => optionToRecommendation(option, action, index + 1))
      .filter(Boolean)
      .slice(0, 5);
  }

  const recommendation = toRecommendation(action, 1);
  return recommendation ? [recommendation] : [];
}

function toRecommendation(action, rank = 1) {
  if (action.type === "dahai") {
    return {
      action: "discard",
      tile: fromMjaiTile(action.pai),
      rank,
      score: bestQValue(action.meta),
      probability: bestProbability(action.meta),
      tags: action.tsumogiri ? ["tsumogiri"] : [],
    };
  }

  if (action.type === "reach") {
    return { action: "riichi", rank, score: bestQValue(action.meta), probability: bestProbability(action.meta), tags: [] };
  }

  if (action.type === "pon") {
    return { action: "pon", tile: fromMjaiTile(action.pai), rank, score: bestQValue(action.meta), probability: bestProbability(action.meta), tags: [] };
  }

  if (action.type === "chi") {
    return { action: "chi", tile: fromMjaiTile(action.pai), rank, score: bestQValue(action.meta), probability: bestProbability(action.meta), tags: [] };
  }

  if (action.type === "ankan" || action.type === "kakan" || action.type === "daiminkan") {
    return { action: "kan", tile: fromMjaiTile(action.pai), rank, score: bestQValue(action.meta), probability: bestProbability(action.meta), tags: [action.type] };
  }

  if (action.type === "hora") {
    return { action: "win", tile: fromMjaiTile(action.pai), rank, score: bestQValue(action.meta), probability: bestProbability(action.meta), tags: [] };
  }

  if (action.type === "none") {
    return { action: "pass", rank, score: bestQValue(action.meta), probability: bestProbability(action.meta), tags: [] };
  }

  return null;
}

function optionToRecommendation(option, action, rank) {
  const base = {
    rank,
    score: option.score,
    probability: option.probability,
    tags: option.code === action.type ? ["selected"] : [],
  };

  if (isMjaiOptionTile(option.code)) {
    return { ...base, action: "discard", tile: fromMjaiTile(option.code), tags: action.type === "dahai" && option.code === action.pai ? ["selected"] : [] };
  }

  if (option.code === "reach") {
    return { ...base, action: "riichi", tags: action.type === "reach" ? ["selected"] : [] };
  }

  if (option.code === "pon") {
    return { ...base, action: "pon", tile: fromMjaiTile(action.pai), tags: action.type === "pon" ? ["selected"] : [] };
  }

  if (option.code === "chi_low" || option.code === "chi_mid" || option.code === "chi_high") {
    return {
      ...base,
      action: "chi",
      tile: fromMjaiTile(action.pai),
      displayLabel: option.code === "chi_low" ? "吃-低" : option.code === "chi_mid" ? "吃-中" : "吃-高",
      tags: action.type === "chi" ? ["selected", option.code] : [option.code],
    };
  }

  if (option.code === "kan_select") {
    return { ...base, action: "kan", tile: fromMjaiTile(action.pai), tags: action.type === "ankan" || action.type === "kakan" || action.type === "daiminkan" ? ["selected", "kan_select"] : ["kan_select"] };
  }

  if (option.code === "hora") {
    return { ...base, action: "win", tile: fromMjaiTile(action.pai), tags: action.type === "hora" ? ["selected"] : [] };
  }

  if (option.code === "none") {
    return { ...base, action: "pass", tags: action.type === "none" ? ["selected"] : [] };
  }

  return null;
}

function runMortal(commandLine, input) {
  const [command, ...args] = splitCommandLine(commandLine);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Mortal process timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `Mortal exited with code ${code}.`));
    });
    child.stdin.end(input);
  });
}

class MortalWorker {
  constructor(commandLine) {
    this.commandLine = commandLine;
    this.child = null;
    this.buffer = "";
    this.stderr = "";
    this.nextId = 1;
    this.pending = new Map();
    this.startPromise = null;
    this.readyResolver = null;
    this.readyRejecter = null;
  }

  isReady() {
    return Boolean(this.child && !this.child.killed);
  }

  async run({ actor, mjai }) {
    await this.start();

    return new Promise((resolve, reject) => {
      const id = String(this.nextId++);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.stop();
        reject(new Error("Mortal worker request timed out."));
      }, workerTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, actor, mjai }) + "\n", (error) => {
        if (!error) {
          return;
        }

        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  start() {
    if (this.isReady()) {
      return Promise.resolve();
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise((resolve, reject) => {
      const [command, ...args] = splitCommandLine(this.commandLine);
      const child = spawn(command, args, { windowsHide: true });
      this.child = child;
      this.buffer = "";
      this.stderr = "";

      const startupTimer = setTimeout(() => {
        this.stop();
        reject(new Error("Mortal worker startup timed out."));
      }, timeoutMs);

      this.readyResolver = () => {
        clearTimeout(startupTimer);
        this.startPromise = null;
        this.readyResolver = null;
        this.readyRejecter = null;
        resolve();
      };
      this.readyRejecter = (error) => {
        clearTimeout(startupTimer);
        this.startPromise = null;
        this.readyResolver = null;
        this.readyRejecter = null;
        reject(error);
      };

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
        this.rejectAll(error);
        this.readyRejecter?.(error);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(startupTimer);
        this.startPromise = null;
        this.child = null;
        const error = new Error(this.stderr.trim() || `Mortal worker exited with code ${code}.`);
        this.rejectAll(error);
        this.readyRejecter?.(error);
      });
    });

    return this.startPromise;
  }

  consumeStdout() {
    let lineEnd = this.buffer.indexOf("\n");

    while (lineEnd >= 0) {
      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);

      if (line) {
        this.handleLine(line);
      }

      lineEnd = this.buffer.indexOf("\n");
    }
  }

  handleLine(line) {
    const payload = safeJson(line);
    const id = payload?.id;

    if (payload?.type === "ready" && id == null) {
      this.readyResolver?.();
      return;
    }

    const pending = typeof id === "string" ? this.pending.get(id) : null;

    if (!pending) {
      if (payload?.error && id == null) {
        const error = new Error(String(payload.error));
        this.readyRejecter?.(error);
        this.rejectAll(error);
        this.stop();
      }
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (payload.error) {
      pending.reject(new Error(String(payload.error)));
      return;
    }

    pending.resolve(typeof payload.stdout === "string" ? payload.stdout : "");
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    this.pending.clear();
  }

  stop() {
    if (this.child && !this.child.killed) {
      this.child.kill();
    }

    this.child = null;
  }
}

worker = workerCommandTemplate ? new MortalWorker(workerCommandTemplate) : null;

function splitCommandLine(commandLine) {
  const parts = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;

  while ((match = pattern.exec(commandLine))) {
    parts.push(match[1] ?? match[2] ?? match[0]);
  }

  return parts;
}

function toMjaiTile(tile) {
  const honorMap = { "1z": "E", "2z": "S", "3z": "W", "4z": "N", "5z": "P", "6z": "F", "7z": "C" };

  if (honorMap[tile]) {
    return honorMap[tile];
  }

  if (/^0[mps]$/.test(tile)) {
    return `5${tile[1]}r`;
  }

  return tile;
}

function fromMjaiTile(tile) {
  const honorMap = { E: "1z", S: "2z", W: "3z", N: "4z", P: "5z", F: "6z", C: "7z" };

  if (honorMap[tile]) {
    return honorMap[tile];
  }

  if (/^5[mps]r$/.test(tile)) {
    return `0${tile[1]}`;
  }

  return tile;
}

function isMjaiOptionTile(code) {
  return /^(?:[1-9][mps]|[ESWNPFC]|5[mps]r)$/.test(code);
}

function maskedHand() {
  return Array.from({ length: 13 }, () => "?");
}

function roundWind(windRound) {
  return ["E", "S", "W", "N"][Number(windRound) || 0] ?? "E";
}

function scores(players) {
  const result = [25000, 25000, 25000, 25000];

  for (const player of players ?? []) {
    result[player.seat] = Number(String(player.score ?? "").replace(/,/g, "")) || player.startScore || 25000;
  }

  return result;
}

function removeOne(tiles, tile) {
  const copy = [...tiles];
  removeOneLoose(copy, tile);

  return copy.slice(0, 13);
}

function hasTile(tiles, tile) {
  if (tiles.includes(tile)) {
    return true;
  }

  const redFiveFallback = typeof tile === "string" && tile.startsWith("0") ? `5${tile.slice(1)}` : typeof tile === "string" && tile.startsWith("5") ? `0${tile.slice(1)}` : "";
  return Boolean(redFiveFallback && tiles.includes(redFiveFallback));
}

function removeOneLoose(tiles, tile) {
  const index = tiles.indexOf(tile);

  if (index >= 0) {
    tiles.splice(index, 1);
    return;
  }

  const redFiveFallback = typeof tile === "string" && tile.startsWith("0") ? `5${tile.slice(1)}` : typeof tile === "string" && tile.startsWith("5") ? `0${tile.slice(1)}` : "";
  const fallbackIndex = redFiveFallback ? tiles.indexOf(redFiveFallback) : -1;

  if (fallbackIndex >= 0) {
    tiles.splice(fallbackIndex, 1);
  }
}

function bestQValue(meta) {
  if (!Array.isArray(meta?.q_values)) {
    return undefined;
  }

  const values = meta.q_values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.max(...values) : undefined;
}

function bestProbability(meta) {
  return metaOptions(meta)[0]?.probability;
}

function metaOptions(meta) {
  if (!Array.isArray(meta?.q_values) || typeof meta.mask_bits !== "number") {
    return [];
  }

  const scores = meta.q_values.filter((value) => typeof value === "number" && Number.isFinite(value));

  if (!scores.length) {
    return [];
  }

  const max = Math.max(...scores);
  const weights = scores.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let scoreIndex = 0;
  const options = [];

  for (let index = 0; index < MJAI_MASK_LIST.length && scoreIndex < scores.length; index += 1) {
    if (!hasMaskBit(meta.mask_bits, index)) {
      continue;
    }

    options.push({
      code: MJAI_MASK_LIST[index],
      score: scores[scoreIndex],
      probability: total > 0 ? weights[scoreIndex] / total : undefined,
    });
    scoreIndex += 1;
  }

  return options.sort((left, right) => (right.probability ?? 0) - (left.probability ?? 0) || right.score - left.score);
}

function hasMaskBit(maskBits, index) {
  return Math.floor(maskBits / 2 ** index) % 2 >= 1;
}

function safeJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
