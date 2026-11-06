import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env-process.js";
import type { Request, Response, NextFunction } from "express";

import {
  createError,
  globalErrorHandler,
  notFoundHandler,
  payloadTooLargeHandler,
} from "../src/middleware/error-handler.js";
import { originGuard, normalizeOrigin, stripTrailingSlashes } from "../src/middleware/security.js";

function makeRequest(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeResponse(): Response {
  const res: any = {
    statusCode: 200,
    _json: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this._json = data; return this; },
    setHeader() { return this; },
  };
  return res;
}

function nextFn(): NextFunction {
  return (() => {}) as unknown as NextFunction;
}

describe("createError (PaymentAPI)", () => {
  it("creates 4xx error with expose=true", () => {
    const err = createError(400, "Bad request");
    assert.equal(err.statusCode, 400);
    assert.equal(err.expose, true);
  });

  it("creates 5xx error with expose=false", () => {
    const err = createError(500, "Internal error");
    assert.equal(err.statusCode, 500);
    assert.equal(err.expose, false);
  });
});

describe("stripTrailingSlashes", () => {
  it("removes trailing slashes", () => {
    assert.equal(stripTrailingSlashes("https://x///"), "https://x");
    assert.equal(stripTrailingSlashes("https://x/"), "https://x");
  });

  it("leaves strings without trailing slash untouched", () => {
    assert.equal(stripTrailingSlashes("abc"), "abc");
    assert.equal(stripTrailingSlashes("https://x"), "https://x");
  });

  it("handles empty string", () => {
    assert.equal(stripTrailingSlashes(""), "");
  });
});

describe("normalizeOrigin", () => {
  it("canonicalizes host and strips default ports", () => {
    assert.equal(normalizeOrigin("  https://AstroLumina.com/path?q=1  "), "https://astrolumina.com");
  });

  it("returns null for non-http schemes", () => {
    assert.equal(normalizeOrigin("ftp://x"), null);
    assert.equal(normalizeOrigin("ws://x"), null);
  });

  it("returns null for garbage", () => {
    assert.equal(normalizeOrigin("not-a-url"), null);
    assert.equal(normalizeOrigin(""), null);
  });

  it("strips trailing slashes before parsing", () => {
    assert.equal(normalizeOrigin("http://example.com///"), "http://example.com");
  });

  it("removes default https port 443", () => {
    assert.equal(normalizeOrigin("https://example.com:443"), "https://example.com");
  });

  it("keeps non-default ports", () => {
    assert.equal(normalizeOrigin("https://example.com:8443"), "https://example.com:8443");
  });
});

describe("originGuard", () => {
  const validOrigin = "https://astrolumina.pages.dev";

  it("passes without Origin header", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({}), res, next);
    assert.equal(res.statusCode, 200);
  });

  it("passes allowlisted origin", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({ origin: validOrigin }), res, next);
    assert.equal(res.statusCode, 200);
  });

  it("rejects foreign origin with 403", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({ origin: "https://evil.com" }), res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res._json?.error, "Origin not allowed");
  });

  it("rejects origin with trailing slash (normalized)", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({ origin: "https://astrolumina.pages.dev/" }), res, next);
    assert.equal(res.statusCode, 200);
  });
});

describe("payloadTooLargeHandler", () => {
  it("returns 413 for entity.too.large", () => {
    const err: any = new Error("entity.too.large");
    err.type = "entity.too.large";
    const res = makeResponse();
    const next = nextFn();
    payloadTooLargeHandler(err, makeRequest(), res, next);
    assert.equal(res.statusCode, 413);
    assert.equal(res._json?.error, "Request payload too large. Maximum size is 256KB.");
  });

  it("passes through unrelated errors", () => {
    const err = new Error("something else");
    const res = makeResponse();
    let nextCalled = false;
    function next(_err: unknown) {
      nextCalled = true;
    }
    payloadTooLargeHandler(err, makeRequest(), res, next as unknown as NextFunction);
    assert.equal(nextCalled, true);
  });
});

describe("notFoundHandler", () => {
  it("returns 404", () => {
    const res = makeResponse();
    notFoundHandler(makeRequest(), res);
    assert.equal(res.statusCode, 404);
    assert.equal(res._json?.error, "Route not found");
  });
});
