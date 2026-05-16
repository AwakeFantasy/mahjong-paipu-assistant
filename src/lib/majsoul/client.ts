import { HttpsProxyAgent } from "https-proxy-agent";
import MJSoul from "mjsoul";
import { AnalyzeError, type MjsoulRegion, type PaipuSource, type RawMjsoulGame, type RawMjsoulRecord } from "./types";
import type { DebugCollector } from "./debug";
import { parseMjsoulRecordBuffer } from "./record-parser";

type MjsoulClient = InstanceType<typeof MJSoul>;

const REGION_URLS: Record<MjsoulRegion, string> = {
  cn: "wss://gateway-cdn.maj-soul.com/gateway",
  jp: "wss://mjjpgs.mahjongsoul.com:4501",
  en: "wss://mjusgs.mahjongsoul.com:4501",
};
const CONNECT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 10000;
const VERSION_TIMEOUT_MS = 4000;
const CN_GATEWAY_FALLBACKS = [
  "wss://gateway-cdn.maj-soul.com/gateway",
  "wss://gateway-vexcdn.maj-soul.com/gateway",
  "wss://gateway-v2.maj-soul.com:5101",
  "wss://gateway-v2.majsoul.com:4501",
];

export type MjsoulCredentials = {
  account?: string;
  password?: string;
  accessToken?: string;
  region: MjsoulRegion;
  clientVersion?: string;
};

type ClientVersion = {
  resource?: string;
  string?: string;
};

export function readMjsoulCredentials(region: MjsoulRegion): MjsoulCredentials {
  return {
    account: process.env.MAJSOUL_ACCOUNT,
    password: process.env.MAJSOUL_PASSWORD,
    accessToken: process.env.MAJSOUL_ACCESS_TOKEN,
    region: (process.env.MAJSOUL_REGION as MjsoulRegion | undefined) ?? region,
    clientVersion: process.env.MAJSOUL_CLIENT_VERSION,
  };
}

export async function fetchMjsoulGame(source: PaipuSource, debug?: DebugCollector): Promise<RawMjsoulGame> {
  const credentials = readMjsoulCredentials(source.region);
  const proxyUrl = readProxyUrl();
  const gateways = getGatewayCandidates(credentials.region);
  const clientVersion = await resolveClientVersion(credentials);
  debug?.setProxyConfigured(Boolean(proxyUrl));

  if (!credentials.accessToken && (!credentials.account || !credentials.password)) {
    throw new AnalyzeError(
      "CONFIG_MISSING",
      "服务端缺少 MAJSOUL_ACCOUNT/MAJSOUL_PASSWORD，无法读取真实牌谱。",
      500,
    );
  }

  let lastError: unknown;

  for (const gatewayUrl of gateways) {
    const client = new MJSoul({
      url: gatewayUrl,
      timeout: REQUEST_TIMEOUT_MS,
      wsOption: proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : {},
    });
    const attemptStarted = Date.now();

    try {
      await runStage(debug, "connect", () => openClient(client));
      debug?.addNetworkAttempt({
        gatewayUrl,
        status: "ok",
        durationMs: Date.now() - attemptStarted,
      });
      await runStage(debug, "login", () => loginClient(client, credentials, clientVersion));
      const response = await runStage(debug, "fetch-record", () =>
        fetchGameRecordWithReadFallback(client, source.id, clientVersion.string, debug),
      );

      const records = await runStage(debug, "parse-record", () => parseRecordResponse(source.id, response, debug));
      const head = isRecord(response.head) ? response.head : undefined;
      const game = { head, records };
      debug?.setRawGame(game);
      return game;
    } catch (error) {
      lastError = error;
      const connectionError = isConnectionError(error);

      if (connectionError) {
        debug?.addNetworkAttempt({
          gatewayUrl,
          status: "error",
          durationMs: Date.now() - attemptStarted,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }

      if (!connectionError) {
        throw normalizeClientError(error);
      }
    } finally {
      client.close();
    }
  }

  throw normalizeClientError(lastError);
}

async function openClient(client: MjsoulClient) {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      client.off("error", onError);
      client.off("open", onOpen);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      client.close();
      reject(new Error("连接雀魂服务超时。"));
    }, CONNECT_TIMEOUT_MS);

    client.once("error", onError);
    client.open(onOpen);
  });
}

async function loginClient(client: MjsoulClient, credentials: MjsoulCredentials, clientVersion: ClientVersion) {
  const loginContext = {
    reconnect: false,
    device: getClientDevice(),
    random_key: process.env.MAJSOUL_RANDOM_KEY || "majsoul",
    client_version: { resource: clientVersion.resource },
    client_version_string: clientVersion.string,
    currency_platforms: readCurrencyPlatforms(),
    gen_access_token: true,
    tag: process.env.MAJSOUL_TAG || "majsoul-hk-client",
  };

  if (credentials.accessToken) {
    await client.sendAsync("oauth2Login", {
      type: 10,
      access_token: credentials.accessToken,
      ...loginContext,
    });
    return;
  }

  await client.sendAsync("login", {
    account: credentials.account,
    password: client.hash(credentials.password ?? ""),
    type: 0,
    ...loginContext,
  });
}

async function resolveClientVersion(credentials: MjsoulCredentials): Promise<ClientVersion> {
  if (credentials.clientVersion) {
    return { resource: credentials.clientVersion, string: credentials.clientVersion };
  }

  return fetchCurrentClientVersion();
}

async function parseRecordResponse(
  id: string,
  response: Record<string, unknown>,
  debug?: DebugCollector,
): Promise<RawMjsoulRecord[]> {
  if (response.data instanceof Uint8Array || Buffer.isBuffer(response.data)) {
    debug?.setRecordSource("data");
    return parseMjsoulRecordBuffer(Buffer.from(response.data));
  }

  if (typeof response.data_url === "string" && response.data_url) {
    debug?.setRecordSource("data_url");
    return parseByUrl(response.data_url);
  }

  debug?.setRecordSource("record-v2");
  return parseById(id);
}

function parseById(id: string) {
  return new Promise<RawMjsoulRecord[]>((resolve, reject) => {
    MJSoul.record.parseById(id, (data) => {
      try {
        resolve(ensureParsedRecords(data));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseByUrl(url: string) {
  return new Promise<RawMjsoulRecord[]>((resolve, reject) => {
    MJSoul.record.parseByUrl(url, (data) => {
      try {
        resolve(ensureParsedRecords(data));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function ensureParsedRecords(data: unknown): RawMjsoulRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isRawRecord);
  }

  throw new AnalyzeError("PARSE_FAILED", "雀魂牌谱数据解析失败。", 502);
}

function normalizeClientError(error: unknown) {
  if (error instanceof AnalyzeError) {
    return error;
  }

  const maybeError = isRecord(error) ? error.error : undefined;
  const code = isRecord(maybeError) ? Number(maybeError.code) : undefined;
  const message = isRecord(maybeError) && typeof maybeError.message === "string" ? maybeError.message : undefined;
  const upstream = readUpstreamError(error);

  if (code === 151) {
    return new AnalyzeError("FETCH_FAILED", "雀魂拒绝了当前操作，请检查账号权限、牌谱链接或客户端参数。", 502, undefined, upstream);
  }

  if (code === 9997) {
    return new AnalyzeError("FETCH_FAILED", "读取雀魂牌谱超时，请稍后重试。", 504, undefined, upstream);
  }

  return new AnalyzeError("FETCH_FAILED", message ?? "读取雀魂牌谱失败。", 502, undefined, upstream);
}

async function fetchGameRecordWithReadFallback(
  client: MjsoulClient,
  gameUuid: string,
  clientVersionString?: string,
  debug?: DebugCollector,
) {
  try {
    return await fetchGameRecord(client, gameUuid, clientVersionString);
  } catch (error) {
    const upstream = readUpstreamError(error);

    if (upstream?.code !== 151) {
      throw error;
    }

    await runStage(debug, "read-game-record", () =>
      client.sendAsync("readGameRecord", {
        game_uuid: gameUuid,
        client_version_string: clientVersionString,
      }),
    );

    return fetchGameRecord(client, gameUuid, clientVersionString);
  }
}

function fetchGameRecord(client: MjsoulClient, gameUuid: string, clientVersionString?: string) {
  return client.sendAsync("fetchGameRecord", {
    game_uuid: gameUuid,
    client_version_string: clientVersionString,
  });
}

function isRawRecord(value: unknown): value is RawMjsoulRecord {
  return isRecord(value) && typeof value.name === "string" && isRecord(value.data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchCurrentClientVersion(): Promise<ClientVersion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS);

  try {
    const response = await fetch("https://game.maj-soul.com/1/version.json", {
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as { version?: string };
    return {
      resource: payload.version,
      string: payload.version ? `web-${payload.version.replace(/\.w$/, "")}` : undefined,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

function readUpstreamError(error: unknown) {
  const source = isRecord(error) && isRecord(error.error) ? error.error : isRecord(error) ? error : undefined;

  if (!source) {
    return undefined;
  }

  const code = Number(source.code);
  const message = typeof source.message === "string" ? source.message : undefined;
  const u32Params = Array.isArray(source.u32_params) ? source.u32_params.map(Number).filter(Number.isFinite) : undefined;
  const strParams = Array.isArray(source.str_params) ? source.str_params.map(String) : undefined;
  const hasJsonParam = typeof source.json_param === "string" && source.json_param.length > 0;

  if (!Number.isFinite(code) && !message && !u32Params?.length && !strParams?.length && !hasJsonParam) {
    return undefined;
  }

  return {
    code: Number.isFinite(code) ? code : undefined,
    message,
    u32Params,
    strParams,
    hasJsonParam,
  };
}

function getClientDevice() {
  return {
    platform: "pc",
    hardware: "pc",
    os: "windows",
    os_version: "Windows 10",
    is_browser: true,
    software: "Chrome",
    sale_platform: "web",
    hardware_vendor: "",
    model_number: "",
  };
}

function readCurrencyPlatforms() {
  const value = process.env.MAJSOUL_CURRENCY_PLATFORMS?.trim();

  if (!value) {
    return [1];
  }

  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
}

function readProxyUrl() {
  const value =
    process.env.MAJSOUL_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    "";
  return value.trim() || undefined;
}

function getGatewayCandidates(region: MjsoulRegion) {
  const override = process.env.MAJSOUL_GATEWAY_URL?.trim();

  if (override) {
    return [override];
  }

  if (region === "cn") {
    return CN_GATEWAY_FALLBACKS;
  }

  return [REGION_URLS[region] ?? REGION_URLS.cn];
}

function isConnectionError(error: unknown) {
  if (error instanceof AnalyzeError) {
    return false;
  }

  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("Unexpected server response") ||
    message.includes("Opening handshake has timed out") ||
    message.includes("WebSocket was closed before the connection was established") ||
    message.includes("Client network socket disconnected") ||
    message.includes("连接雀魂服务超时")
  );
}

function runStage<T>(
  debug: DebugCollector | undefined,
  name: "connect" | "login" | "fetch-record" | "read-game-record" | "parse-record",
  fn: () => Promise<T>,
) {
  return debug ? debug.stage(name, fn) : fn();
}
