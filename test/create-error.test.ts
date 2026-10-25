import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createError,
  payloadTooLargeHandler,
  notFoundHandler,
  globalErrorHandler,
} from "../src/middleware/error-handler.js";

describe("createError", () => {
  it("marks 4xx exposeable", () => {
    const err = createError(422, "invalid");
    assert.equal(err.statusCode, 422);
    assert.equal(err.expose, true);
  });

  it("marks 5xx hidden", () => {
    const err = createError(502, "upstream");
    assert.equal(err.statusCode, 502);
    assert.equal(err.expose, false);
  });
});

describe("handlers", () => {
  function makeRes() {
    const res: any = {};
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body: any) => {
      res.body = body;
      return res;
    };
    return res;
  }

  it("notFoundHandler returns 404", () => {
    const res = makeRes();
    notFoundHandler({} as any, res as any);
    assert.equal(res.statusCode, 404);
  });

  it("payloadTooLargeHandler replies 413", () => {
    const res = makeRes();
    let nextCalled = false;
    payloadTooLargeHandler(
      { message: "entity.too.large", type: "entity.too.large" } as any,
      {} as any,
      res as any,
      () => { nextCalled = true; },
    );
    assert.equal(res.statusCode, 413);
    assert.equal(nextCalled, false);
  });

  it("globalErrorHandler returns message in non-production", () => {
    const res = makeRes();
    globalErrorHandler(
      { statusCode: 409, message: "conflict" } as any,
      {} as any,
      res as any,
      () => {},
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, "conflict");
  });
});
