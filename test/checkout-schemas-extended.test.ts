import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env.js";

import { checkoutBodySchema } from "../src/routes/checkout.js";

describe("checkoutBodySchema", () => {
  it("accepts a valid minimal payload", () => {
    const res = checkoutBodySchema.safeParse({ amount: 1500, currency: "EUR" });
    assert.equal(res.success, true);
    if (res.success) {
      assert.equal(res.data.amount, 1500);
      assert.equal(res.data.currency, "EUR");
      assert.equal(res.data.ticketCount, 1);
    }
  });

  it("requires amount >= 1", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 0, currency: "EUR" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 1, currency: "EUR" }).success, true);
    assert.equal(checkoutBodySchema.safeParse({ amount: -5, currency: "EUR" }).success, false);
  });

  it("requires amount to be an integer", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 1500.5, currency: "EUR" }).success,
      false,
    );
    assert.equal(
      checkoutBodySchema.safeParse({ amount: "1500", currency: "EUR" }).success,
      true, // z.coerce allows string coercion
    );
  });

  it("rejects amount above 100_000_000", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100_000_001, currency: "EUR" }).success,
      false,
    );
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100_000_000, currency: "EUR" }).success,
      true,
    );
  });

  it("requires a 3-letter uppercase currency", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR" }).success, true);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "usd" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EURO" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "E" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "123" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR!" }).success, false);
  });

  it("defaults ticketCount to 1", () => {
    const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR" });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.ticketCount, 1);
  });

  it("accepts ticketCount between 1 and 20 inclusive", () => {
    for (const tc of [1, 10, 20]) {
      const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", ticketCount: tc });
      assert.equal(res.success, true, `ticketCount ${tc} should be valid`);
    }
  });

  it("rejects ticketCount outside range", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", ticketCount: 0 }).success,
      false,
    );
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", ticketCount: 21 }).success,
      false,
    );
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", ticketCount: -1 }).success,
      false,
    );
  });

  it("accepts a valid optional eventId", () => {
    const res = checkoutBodySchema.safeParse({
      amount: 100,
      currency: "EUR",
      eventId: "constelatie-ianuarie-2027",
    });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.eventId, "constelatie-ianuarie-2027");
  });

  it("rejects eventId containing control characters", () => {
    for (const bad of ["ev\r\nX", "ev\rX", "ev\nX", "ev\tX", "ev\x00X", "ev\x1fX", "ev\x7fX"]) {
      assert.equal(
        checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: bad }).success,
        false,
        `eventId ${JSON.stringify(bad)} should be rejected`,
      );
    }
  });

  it("rejects eventId longer than 100 chars", () => {
    const longId = "a".repeat(101);
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: longId }).success,
      false,
    );
    const exact100 = "a".repeat(100);
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: exact100 }).success,
      true,
    );
  });

  it("accepts an optional product up to 64 chars", () => {
    const res = checkoutBodySchema.safeParse({
      amount: 100,
      currency: "EUR",
      product: "ghid-saturn-in-berbec",
    });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.product, "ghid-saturn-in-berbec");
  });

  it("rejects empty product", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", product: "" }).success,
      false,
    );
  });

  it("rejects product longer than 64 chars", () => {
    const longProduct = "a".repeat(65);
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", product: longProduct }).success,
      false,
    );
  });

  it("ignores unknown fields", () => {
    const res = checkoutBodySchema.safeParse({
      amount: 100,
      currency: "EUR",
      extra: true,
      another: "ignored",
    });
    assert.equal(res.success, true);
  });

  it("rejects missing amount", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ currency: "EUR" }).success,
      false,
    );
  });

  it("rejects missing currency", () => {
    assert.equal(
      checkoutBodySchema.safeParse({ amount: 100 }).success,
      false,
    );
  });
});
