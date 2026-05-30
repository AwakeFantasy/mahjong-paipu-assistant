import { createHash, randomUUID } from "node:crypto";

import { AnalyzeError, type AnalyzeErrorCode, type MjsoulRegion } from "./types";

const YOSTAR_SDK_VERSION = "4.16.0";
const SIGNING_SALT = Buffer.from([
  52, 116, 103, 19, 26, 70, 111, 104, 101, 215, 242, 102, 46, 56, 132, 31, 190, 42, 219, 35,
]).toString("hex");

export type YostarRegion = Extract<MjsoulRegion, "en" | "jp">;

export function makeYostarDeviceId() {
  return randomUUID();
}

export async function loginYostarWithSavedSession(
  userId: string,
  sessionToken: string,
  deviceId: string,
  region: YostarRegion = "en",
) {
  const payload = await yostarPost(yostarQuickLoginUrl(region), {}, deviceId, region, userId, sessionToken);
  const token = readNestedString(payload, ["Data", "UserInfo", "Token"]);

  if (payload.Code !== 200 || !token) {
    throw yostarError("YOSTAR_SESSION_FAILED", "Yostar 会话刷新失败，请重新获取邮箱验证码。", payload);
  }

  return token;
}

async function yostarPost(
  url: string,
  body: Record<string, unknown>,
  deviceId: string,
  region: YostarRegion,
  userId?: string,
  token?: string,
) {
  const head: Record<string, string | number> = {
    Region: region === "jp" ? "JP" : "US",
    PID: region === "jp" ? "JP-MAJONGSOUL" : "US-MAJONGSOUL",
    Channel: "web",
    Platform: "pc",
    Version: YOSTAR_SDK_VERSION,
    Lang: region === "jp" ? "jp" : "en",
    DeviceID: deviceId,
    Time: Math.floor(Date.now() / 1000),
  };

  if (userId) {
    head.UID = userId;
  }

  if (token) {
    head.Token = token;
  }

  const authorization = {
    Head: head,
    Sign: signPayload(head, body),
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: JSON.stringify(authorization),
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AnalyzeError("YOSTAR_BAD_RESPONSE", "Yostar 返回了无法解析的响应。", 502);
  }
}

function signPayload(head: Record<string, unknown>, body: Record<string, unknown>) {
  return createHash("md5")
    .update(`${JSON.stringify(head)}${JSON.stringify(body)}${SIGNING_SALT}`)
    .digest("hex")
    .toUpperCase();
}

function yostarQuickLoginUrl(region: YostarRegion) {
  return `${yostarPlatformUrl(region)}/user/quick-login`;
}

function yostarPlatformUrl(region: YostarRegion) {
  return region === "jp" ? "https://jp-sdk-api.yostarplat.com" : "https://en-sdk-api.yostarplat.com";
}

function readNestedString(source: unknown, path: string[]) {
  let current = source;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return "";
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current === undefined || current === null ? "" : String(current);
}

function yostarError(code: AnalyzeErrorCode, message: string, payload: Record<string, unknown>) {
  const data = payload.Data;

  return new AnalyzeError(code, message, 502, undefined, {
    code: typeof payload.Code === "number" ? payload.Code : undefined,
    message: typeof payload.Message === "string" ? payload.Message : undefined,
    desc: typeof payload.Desc === "string" ? payload.Desc : undefined,
    dataKeys: data && typeof data === "object" ? Object.keys(data as Record<string, unknown>) : undefined,
  });
}
