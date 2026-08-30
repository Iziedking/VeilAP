import { describe, expect, it } from "vitest";

import { JsonBodyError, jsonBodyErrorResponse, readJsonBody } from "./json-body";

describe("readJsonBody", () => {
  it("accepts a JSON body within the byte limit", async () => {
    const request = new Request("https://api.veila.xyz/test", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ agentId: "EMBER" }),
    });
    await expect(readJsonBody(request, 128)).resolves.toEqual({ agentId: "EMBER" });
  });

  it("rejects a declared body that exceeds the limit before reading it", async () => {
    const request = new Request("https://api.veila.xyz/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "4096" },
      body: "{}",
    });
    await expect(readJsonBody(request, 128)).rejects.toMatchObject({
      code: "REQUEST_BODY_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects streamed bodies that cross the limit", async () => {
    const request = new Request("https://api.veila.xyz/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: "x".repeat(256) }),
    });
    await expect(readJsonBody(request, 64)).rejects.toMatchObject({
      code: "REQUEST_BODY_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects non-JSON media types", async () => {
    const request = new Request("https://api.veila.xyz/test", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });
    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: "CONTENT_TYPE_REQUIRED",
      status: 415,
    });
  });
});

describe("jsonBodyErrorResponse", () => {
  it("preserves the bounded body error status and disables caching", async () => {
    const response = jsonBodyErrorResponse(new JsonBodyError("REQUEST_BODY_TOO_LARGE", 413));
    expect(response?.status).toBe(413);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    await expect(response?.json()).resolves.toEqual({ ok: false, code: "REQUEST_BODY_TOO_LARGE" });
  });

  it("does not handle unrelated failures", () => {
    expect(jsonBodyErrorResponse(new Error("boom"))).toBeUndefined();
  });
});
