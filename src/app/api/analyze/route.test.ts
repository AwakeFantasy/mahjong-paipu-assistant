import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const validBody = {
  url: "https://game.maj-soul.com/1/?paipu=240101-11111111-2222-4333-8444-555555555555",
  debug: true,
};

describe("POST /api/analyze", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns debug details in non-production responses", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MAJSOUL_ACCOUNT", "");
    vi.stubEnv("MAJSOUL_PASSWORD", "");

    const response = await POST(makeRequest(validBody));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("CONFIG_MISSING");
    expect(payload.debug).toMatchObject({
      enabled: true,
      source: {
        id: "240101-11111111-2222-4333-8444-555555555555",
        region: "cn",
      },
      error: {
        code: "CONFIG_MISSING",
      },
    });
  });

  it("suppresses debug details in production responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAJSOUL_ACCOUNT", "");
    vi.stubEnv("MAJSOUL_PASSWORD", "");

    const response = await POST(makeRequest(validBody));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("CONFIG_MISSING");
    expect(payload.debug).toBeUndefined();
  });
});

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}
