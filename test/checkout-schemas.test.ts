import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env.js";

import { checkoutBodySchema } from "../src/routes/checkout.js";

describe("checkoutBodySchema", () => {
  it("requires amount >= 1", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 0, currency: "EUR" }).success,
      false
    );
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 1, currency: "EUR" }).success,
      true
    );
  });

  it("rejects amount above 100M", () => {
    assert.equal(
      checkoutBodySchema.safeParse({
        amount: 100_000_001,
        currency: "EUR",
      }).success,
      false
    );
  });

  it("requires a 3-letter uppercase currency", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR" }).success,
      true
    );
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "usd" }).success,
      false
    );
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EURO" }).success,
      false
    );
  });

  it("defaults ticketCount to 1", () => {
    const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR" });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.ticketCount, 1);
  });

  it("accepts a valid ticketCount between 1 and 20", () => {
    assert.equal(
      checkoutBodySchema.safeParse({
        amount: 100,
        currency: "EUR",
        ticketCount: 5,
      }).success,
      true
    );
    assert.equal(
      checkoutBodySchema.safeParse({
        amount: 100,
        currency: "EUR",
        ticketCount: 20,
      }).success,
      true
    );
  });

  it("rejects ticketCount outside the range", () => {
    assert.equal(
      checkoutBodySchema.safeParse({
        amount: 100,
        currency: "EUR",
        ticketCount: 0,
      }).success,
      false
    );
    assert.equal(
      checkoutBodySchema.safeParse({
        amount: 100,
        currency: "EUR",
        ticketCount: 21,
      }).success,
      false
    );
  });

  it("accepts a valid eventId and ignores unknown fields", () => {
    const res = checkoutBodySchema.safeParse({
      amount: 100,
      currency: "EUR",
      eventId: "ev-123",
      extra: true,
    });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.eventId, "ev-123");
  });

  it("rejects eventId containing control characters", () => {
    assert.equal(
      checkoutBodySchema.safeParse({
        amount: 100,
        currency: "EUR",
        eventId: "ev\r\nX",
      }).success,
      false
    );
  });
});