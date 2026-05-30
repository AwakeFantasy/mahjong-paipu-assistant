import { HttpsProxyAgent } from "https-proxy-agent";
import MJSoul from "mjsoul";
import { randomUUID } from "node:crypto";
import { Field } from "protobufjs";
import { AnalyzeError, type MahjongSoulRegion, type PaipuSource, type RawMjsoulGame, type RawMjsoulRecord } from "./types";
import type { DebugCollector } from "./debug";
import { parseMjsoulRecordBuffer } from "./record-parser";
import { loginYostarWithSavedSession, makeYostarDeviceId } from "./yostar";

type MjsoulClient = InstanceType<typeof MJSoul>;

const REGION_URLS: Record<MahjongSoulRegion, string> = {
  cn: "wss://gateway-cdn.maj-soul.com/gateway",
  jp: "wss://mjjpgs.mahjongsoul.com:4501",
  en: "wss://mjusgs.mahjongsoul.com:4501",
};
const CONNECT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 10000;
const VERSION_TIMEOUT_MS = 4000;
const ROUTE_TIMEOUT_MS = 5000;
const CN_GATEWAY_FALLBACKS = [
  "wss://route-2.maj-soul.com/gateway",
  "wss://route-3.maj-soul.com:8443/gateway",
  "wss://route-4.maj-soul.com/gateway",
  "wss://route-5.maj-soul.com/gateway",
  "wss://route-6.maj-soul.com/gateway",
  "wss://gateway-cdn.maj-soul.com/gateway",
  "wss://gateway-vexcdn.maj-soul.com/gateway",
  "wss://gateway-v2.maj-soul.com:5101",
  "wss://gateway-v2.majsoul.com:4501",
];
const EN_GATEWAY_FALLBACKS = ["wss://engs.mahjongsoul.com:443/gateway", "wss://mjusgs.mahjongsoul.com:4501"];

export type MjsoulCredentials = {
  account?: string;
  password?: string;
  accessToken?: string;
  oauth2Code?: string;
  oauth2Uid?: string;
  oauth2Type?: number;
  yostarEmail?: string;
  yostarUid?: string;
  yostarToken?: string;
  yostarDeviceId?: string;
  region: MahjongSoulRegion;
  clientVersion?: string;
};

type ClientVersion = {
  resource?: string;
  string?: string;
};

type MjsoulRootLike = {
  lookupType(name: string): {
    fields?: Record<string, unknown>;
    add(field: unknown): unknown;
  };
};

type MjsoulClientWithRoot = MjsoulClient & {
  root?: MjsoulRootLike;
};

export function readMjsoulCredentials(region: MahjongSoulRegion): MjsoulCredentials {
  const envRegion = region;

  return {
    account: readRegionEnv(envRegion, "ACCOUNT"),
    password: readRegionEnv(envRegion, "PASSWORD"),
    accessToken: readRegionEnv(envRegion, "ACCESS_TOKEN"),
    oauth2Code: readRegionEnv(envRegion, "OAUTH2_CODE"),
    oauth2Uid: readRegionEnv(envRegion, "OAUTH2_UID"),
    oauth2Type: readOptionalNumber(readRegionEnv(envRegion, "OAUTH2_TYPE")),
    yostarEmail: readRegionEnv(envRegion, "YOSTAR_EMAIL"),
    yostarUid: readRegionEnv(envRegion, "YOSTAR_UID"),
    yostarToken: readRegionEnv(envRegion, "YOSTAR_TOKEN"),
    yostarDeviceId: readRegionEnv(envRegion, "YOSTAR_DEVICE_ID"),
    region,
    clientVersion: readRegionEnv(envRegion, "CLIENT_VERSION"),
  };
}

export async function fetchMjsoulGame(source: PaipuSource & { region: MahjongSoulRegion }, debug?: DebugCollector): Promise<RawMjsoulGame> {
  const credentials = readMjsoulCredentials(source.region);
  const proxyUrl = readProxyUrl(credentials.region);
  const clientVersion = await resolveClientVersion(credentials);
  const gateways = await getGatewayCandidates(credentials.region);
  debug?.setProxyConfigured(Boolean(proxyUrl));

  if (!hasExplicitAuth(credentials)) {
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
    patchMjsoulProtocol(client);
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
  if (credentials.yostarUid && credentials.yostarToken) {
    await loginWithYostarSession(client, credentials, clientVersion);
    return;
  }

  if (credentials.oauth2Code && credentials.oauth2Uid) {
    await loginWithOauth2Flow(client, credentials, clientVersion);
    return;
  }

  if (credentials.accessToken) {
    await loginWithOauth2Token(client, credentials.accessToken, credentials, clientVersion);
    return;
  }

  await client.sendAsync("login", {
    account: credentials.account,
    password: client.hash(credentials.password ?? ""),
    type: 0,
    reconnect: true,
    device: getClientDevice(),
    random_key: readRandomKey(),
    client_version: { resource: clientVersion.resource },
    client_version_string: clientVersion.string,
    currency_platforms: readCurrencyPlatforms("password"),
    gen_access_token: true,
    tag: readLoginTag(credentials.region),
  });
}

async function loginWithYostarSession(
  client: MjsoulClient,
  credentials: MjsoulCredentials,
  clientVersion: ClientVersion,
) {
  if (credentials.region !== "en" && credentials.region !== "jp") {
    throw new AnalyzeError("CONFIG_MISSING", "Yostar 登录只支持雀魂国际服/日服。", 500);
  }

  const uid = credentials.yostarUid ?? "";
  const deviceId = credentials.yostarDeviceId || makeYostarDeviceId();
  let code = credentials.yostarToken ?? "";

  try {
    code = await loginYostarWithSavedSession(uid, code, deviceId, credentials.region);
  } catch (error) {
    if (!(error instanceof AnalyzeError) || error.code !== "YOSTAR_SESSION_FAILED") {
      throw error;
    }
  }

  await loginWithOauth2Flow(client, { ...credentials, oauth2Code: code, oauth2Uid: uid, oauth2Type: 22 }, clientVersion);
}

async function loginWithOauth2Flow(
  client: MjsoulClient,
  credentials: MjsoulCredentials,
  clientVersion: ClientVersion,
) {
  const type = readOauth2Type(credentials);
  const authResponse = await client.sendAsync("oauth2Auth", {
    type,
    code: credentials.oauth2Code,
    uid: credentials.oauth2Uid,
    client_version_string: clientVersion.string,
  });
  const accessToken = isRecord(authResponse) && typeof authResponse.access_token === "string" ? authResponse.access_token : "";

  const checkResponse = await client.sendAsync("oauth2Check", {
    type,
    access_token: accessToken,
  });

  if (isRecord(checkResponse) && checkResponse.has_account === false) {
    await oauth2Signup(client, type, accessToken, clientVersion);
  }

  await loginWithOauth2Token(client, accessToken, credentials, clientVersion);
}

async function oauth2Signup(
  client: MjsoulClient,
  type: number,
  accessToken: string,
  clientVersion: ClientVersion,
) {
  await client.sendAsync("oauth2Signup", {
    type,
    access_token: accessToken,
    device: getClientDevice(),
    client_version: { resource: clientVersion.resource },
    client_version_string: clientVersion.string,
    tag: "majsoul-hk-client",
  });
}

async function loginWithOauth2Token(
  client: MjsoulClient,
  accessToken: string,
  credentials: MjsoulCredentials,
  clientVersion: ClientVersion,
) {
  await client.sendAsync("oauth2Login", {
    type: readOauth2Type(credentials),
    access_token: accessToken,
    reconnect: true,
    device: getClientDevice(),
    random_key: readRandomKey(),
    client_version: { resource: clientVersion.resource },
    client_version_string: clientVersion.string,
    currency_platforms: readCurrencyPlatforms("oauth2"),
    version: 0,
  });
}

function hasExplicitAuth(credentials: MjsoulCredentials) {
  return Boolean(
    (credentials.yostarUid && credentials.yostarToken) ||
      (credentials.oauth2Code && credentials.oauth2Uid) ||
      credentials.accessToken ||
      (credentials.account && credentials.password),
  );
}

function patchMjsoulProtocol(client: MjsoulClientWithRoot) {
  addStringFieldIfMissing(client.root, "ReqLogin", "tag", 12);
  addStringFieldIfMissing(client.root, "ReqOauth2Login", "tag", 11);
  addStringFieldIfMissing(client.root, "ReqOauth2Signup", "tag", 8);
  addFieldIfMissing(client.root, "ClientDeviceInfo", "screen_width", 10, "uint32");
  addFieldIfMissing(client.root, "ClientDeviceInfo", "screen_height", 11, "uint32");
  addStringFieldIfMissing(client.root, "ClientDeviceInfo", "user_agent", 12);
  addFieldIfMissing(client.root, "ClientDeviceInfo", "screen_type", 13, "uint32");
}

function addStringFieldIfMissing(root: MjsoulRootLike | undefined, typeName: string, fieldName: string, id: number) {
  addFieldIfMissing(root, typeName, fieldName, id, "string");
}

function addFieldIfMissing(
  root: MjsoulRootLike | undefined,
  typeName: string,
  fieldName: string,
  id: number,
  fieldType: string,
) {
  if (!root) {
    return;
  }

  const type = root.lookupType(typeName);

  if (type.fields?.[fieldName]) {
    return;
  }

  type.add(new Field(fieldName, id, fieldType));
}

async function resolveClientVersion(credentials: MjsoulCredentials): Promise<ClientVersion> {
  if (credentials.clientVersion) {
    return normalizeClientVersion(credentials.clientVersion);
  }

  return fetchCurrentClientVersion(credentials.region);
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

function normalizeClientVersion(value: string): ClientVersion {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("web-")) {
    return { resource: trimmed.slice(4).replace(/\.w$/, ""), string: trimmed };
  }

  return {
    resource: trimmed.replace(/\.w$/, ""),
    string: `web-${trimmed.replace(/\.w$/, "")}`,
  };
}

async function fetchCurrentClientVersion(region: MahjongSoulRegion): Promise<ClientVersion> {
  if (region === "cn") {
    const unityVersion = await fetchCurrentCnUnityWebVersion();

    if (unityVersion.string) {
      return unityVersion;
    }
  }

  return fetchLegacyWebVersion(region);
}

async function fetchCurrentCnUnityWebVersion(): Promise<ClientVersion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS);

  try {
    const response = await fetch("https://game.maj-soul.com/1/index.html", {
      signal: controller.signal,
      cache: "no-store",
    });
    const html = await response.text();
    const version = html.match(/productVersion:\s*"([^"]+)"/)?.[1] ?? html.match(/release-([0-9]+(?:\.[0-9]+)+)/)?.[1];
    return version ? { resource: version, string: `web-${version}` } : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLegacyWebVersion(region: MahjongSoulRegion = "cn"): Promise<ClientVersion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS);

  try {
    const response = await fetch(`${getRegionHttpBase(region)}/version.json`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as { version?: string };
    return {
      resource: payload.version?.replace(/\.w$/, ""),
      string: payload.version ? `web-${payload.version.replace(/\.w$/, "")}` : undefined,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCurrentCnGateways(): Promise<string[]> {
  const routeVersion = await fetchLegacyWebVersion("cn");

  if (!routeVersion.resource) {
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

  try {
    const configResponse = await fetch(`https://game.maj-soul.com/1/v${routeVersion.resource}.w/config.json`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const config = (await configResponse.json()) as {
      ip?: Array<{
        name?: string;
        gateways?: Array<{ url?: string }>;
      }>;
    };
    const gatewayUrls =
      config.ip?.find((item) => item.name === "player")?.gateways?.map((gateway) => gateway.url).filter(isString) ?? [];
    const routeUrls = gatewayUrls.length ? gatewayUrls : ["https://route-2.maj-soul.com"];
    const candidates: string[] = [];

    for (const routeUrl of routeUrls) {
      const routesResponse = await fetch(
        `${routeUrl}/api/clientgate/routes?platform=Web&version=${encodeURIComponent(`${routeVersion.resource}.w`)}&lang=en&randv=${Math.floor(Math.random() * 1_000_000_000)}`,
        {
          signal: controller.signal,
          cache: "no-store",
        },
      );
      const routes = (await routesResponse.json()) as {
        data?: {
          routes?: Array<{ domain?: string; ssl?: boolean; state?: string; order?: number }>;
        };
      };
      const domains =
        routes.data?.routes
          ?.filter((route) => route.ssl !== false && route.domain && route.state !== "maintain")
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((route) => `wss://${route.domain}/gateway`) ?? [];
      candidates.push(...domains);

      if (candidates.length) {
        break;
      }
    }

    return candidates;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCurrentRegionGateways(region: MahjongSoulRegion): Promise<string[]> {
  const routeVersion = await fetchLegacyWebVersion(region);

  if (!routeVersion.resource) {
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

  try {
    const configResponse = await fetch(`${getRegionHttpBase(region)}/v${routeVersion.resource}.w/config.json`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const config = (await configResponse.json()) as {
      ip?: Array<{
        name?: string;
        gateways?: Array<{ url?: string }>;
      }>;
    };
    const routeUrls =
      config.ip?.find((item) => item.name === "player")?.gateways?.map((gateway) => gateway.url).filter(isString) ?? [];
    const candidates: string[] = [];

    for (const routeUrl of routeUrls) {
      const routesResponse = await fetch(
        `${routeUrl}/api/clientgate/routes?platform=Web&version=${encodeURIComponent(`${routeVersion.resource}.w`)}&lang=${region === "jp" ? "jp" : "en"}&randv=${Math.floor(Math.random() * 1_000_000_000)}`,
        {
          signal: controller.signal,
          cache: "no-store",
        },
      );
      const routes = (await routesResponse.json()) as {
        data?: {
          routes?: Array<{ domain?: string; ssl?: boolean; state?: string; order?: number }>;
        };
      };
      const domains =
        routes.data?.routes
          ?.filter((route) => route.ssl !== false && route.domain && route.state !== "maintain")
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((route) => `wss://${route.domain}/gateway`) ?? [];
      candidates.push(...domains);

      if (candidates.length) {
        break;
      }
    }

    return candidates;
  } catch {
    return [];
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
    screen_width: 1920,
    screen_height: 1080,
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    screen_type: 1,
  };
}

function readCurrencyPlatforms(mode: "password" | "oauth2") {
  const value = process.env.MAJSOUL_CURRENCY_PLATFORMS?.trim();

  if (!value) {
    return mode === "password" ? [1, 2, 5, 6, 8, 10, 11] : [1, 4, 5, 9, 12];
  }

  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
}

function readLoginTag(region: MahjongSoulRegion) {
  return process.env.MAJSOUL_TAG || (region === "cn" ? "cn" : "majsoul-hk-client");
}

function readRegionEnv(region: MahjongSoulRegion, suffix: string) {
  const regionKey = `MAJSOUL_${region.toUpperCase()}_${suffix}`;
  const genericKey = `MAJSOUL_${suffix}`;

  if (process.env[regionKey]) {
    return process.env[regionKey];
  }

  return region === "cn" ? process.env[genericKey] : undefined;
}

function readOauth2Type(credentials: MjsoulCredentials) {
  return credentials.oauth2Type ?? (credentials.region === "cn" ? 7 : 22);
}

function readRandomKey() {
  return process.env.MAJSOUL_RANDOM_KEY || randomUUID();
}

function readOptionalNumber(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readProxyUrl(region: MahjongSoulRegion) {
  const value = process.env[`MAJSOUL_${region.toUpperCase()}_PROXY_URL`] || process.env.MAJSOUL_PROXY_URL || "";
  const normalized = value.trim().toLowerCase();

  if (["direct", "none", "off", "false", "0"].includes(normalized)) {
    return undefined;
  }

  return value.trim() || undefined;
}

async function getGatewayCandidates(region: MahjongSoulRegion) {
  const regionOverride = process.env[`MAJSOUL_${region.toUpperCase()}_GATEWAY_URL`]?.trim();
  const override = regionOverride || (region === "cn" ? process.env.MAJSOUL_GATEWAY_URL?.trim() : "");

  if (override) {
    return [override];
  }

  if (region === "cn") {
    return uniqueStrings([...(await fetchCurrentCnGateways()), ...CN_GATEWAY_FALLBACKS]);
  }

  const fallbackGateways = region === "en" ? EN_GATEWAY_FALLBACKS : [REGION_URLS[region] ?? REGION_URLS.cn];
  return uniqueStrings([...(await fetchCurrentRegionGateways(region)), ...fallbackGateways]);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(isString)));
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getRegionHttpBase(region: MahjongSoulRegion) {
  if (region === "en") {
    return "https://mahjongsoul.game.yo-star.com";
  }

  if (region === "jp") {
    return "https://game.mahjongsoul.com";
  }

  return "https://game.maj-soul.com/1";
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
