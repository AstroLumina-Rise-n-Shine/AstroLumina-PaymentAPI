import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env.js";

import {
  productParamSchema,
  checkoutBodySchema,
  sessionQuerySchema,
} from "../src/routes/checkout.js";

describe("productParamSchema", () => {
  it("accepts a non-empty slug", () => {
    assert.equal(productParamSchema.safeParse({ product: "soarele-stralucirea-ta" }).success, true);
  });

  it("rejects missing product", () => {
    assert.equal(productParamSchema.safeParse({}).success, false);
  });

  it("rejects a product slug longer than 64", () => {
    assert.equal(productParamSchema.safeParse({ product: "a".repeat(65) }).success, false);
  });
});

describe("checkoutBodySchema", () => {
  it("defaults ticketCount to 1", () => {
    const res = checkoutBodySchema.safeParse({});
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.ticketCount, 1);
  });

  it("accepts a valid ticketCount between 1 and 20", () => {
    assert.equal(checkoutBodySchema.safeParse({ ticketCount: 5 }).success, true);
    assert.equal(checkoutBodySchema.safeParse({ ticketCount: 20 }).success, true);
  });

  it("rejects ticketCount outside the range", () => {
    assert.equal(checkoutBodySchema.safeParse({ ticketCount: 0 }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ ticketCount: 21 }).success, false);
  });

  it("accepts a valid eventId and ignores unknown fields", () => {
    const res = checkoutBodySchema.safeParse({ eventId: "ev-123", extra: true });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.eventId, "ev-123");
  });

  it("rejects eventId containing control characters", () => {
    assert.equal(checkoutBodySchema.safeParse({ eventId: "ev\r\nX" }).success, false);
  });
});

describe("sessionQuerySchema", () => {
  it("requires a non-empty session_id", () => {
    assert.equal(sessionQuerySchema.safeParse({}).success, false);
    assert.equal(sessionQuerySchema.safeParse({ session_id: "" }).success, false);
  });

  it("accepts a normal session id", () => {
    assert.equal(sessionQuerySchema.safeParse({ session_id: "cs_test_abc" }).success, true);
  });

  it("rejects session_id longer than 255 chars", () => {
    assert.equal(sessionQuerySchema.safeParse({ session_id: "a".repeat(256) }).success, false);
  });
});
