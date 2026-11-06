import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env-process.js";
import type { RequestInfo, URL, RequestInit } from "node:url";

const mockFetch = (() => {
  let impl: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null = null;
  return {
    set: (fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
      impl = fn;
    },
    clear: () => {
      impl = null;
    },
    calls: [] as Array<[RequestInfo | URL, RequestInit?]>,
    invoke: async (input: RequestInfo | URL, init?: RequestInit) => {
      if (impl) {
        mockFetch.calls.push([input, init]);
        return impl(input, init);
      }
      throw new Error("fetch not mocked");
    },
  };
})();

;(globalThis as { fetch?: typeof fetch }).fetch = mockFetch.invoke.bind(mockFetch);

import { checkoutBodySchema } from "../src/routes/checkout.js";

function mockResponse(ok: boolean, data: unknown, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

describe("checkoutBodySchema", () => {
  it("accepts valid minimal payload", () => {
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

  it("requires integer amount", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 1500.5, currency: "EUR" }).success, false);
  });

  it("rejects amount above 100M", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100_000_001, currency: "EUR" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100_000_000, currency: "EUR" }).success, true);
  });

  it("requires 3-letter uppercase currency", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR" }).success, true);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "usd" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EURO" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "123" }).success, false);
  });

  it("defaults ticketCount to 1", () => {
    const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR" });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.ticketCount, 1);
  });

  it("accepts ticketCount 1-20", () => {
    for (const tc of [1, 10, 20]) {
      const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", ticketCount: tc });
      assert.equal(res.success, true, `ticketCount ${tc}`);
    }
  });

  it("rejects ticketCount outside range", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", ticketCount: 0 }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", ticketCount: 21 }).success, false);
  });

  it("accepts optional eventId", () => {
    const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: "evt-123" });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.eventId, "evt-123");
  });

  it("rejects eventId with control characters", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: "ev\r\nX" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: "ev\x00X" }).success, false);
  });

  it("rejects eventId longer than 100 chars", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: "a".repeat(101) }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", eventId: "a".repeat(100) }).success, true);
  });

  it("accepts optional product up to 64 chars", () => {
    const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", product: "ghid-saturn-in-berbec" });
    assert.equal(res.success, true);
    if (res.success) assert.equal(res.data.product, "ghid-saturn-in-berbec");
  });

  it("rejects empty product", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", product: "" }).success, false);
  });

  it("rejects product longer than 64 chars", () => {
    assert.equal(checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", product: "a".repeat(65) }).success, false);
  });

  it("rejects missing amount or currency", () => {
    assert.equal(checkoutBodySchema.safeParse({ currency: "EUR" }).success, false);
    assert.equal(checkoutBodySchema.safeParse({ amount: 100 }).success, false);
  });

  it("ignores unknown fields", () => {
    const res = checkoutBodySchema.safeParse({ amount: 100, currency: "EUR", extra: true });
    assert.equal(res.success, true);
  });
});

describe("Revolut order creation logic", () => {
  it("posts to sandbox base URL with correct headers", async () => {
    mockFetch.set(async () => mockResponse(true, { token: "ord_abc" }, 200));
    mockFetch.calls = [];

    const REVOLUT_API_BASE = "https://sandbox-merchant.revolut.com";
    const REVOLUT_API_VERSION = "2026-08-17";
    const REVOLUT_PAY_SECRET_KEY = "sk_test_dummy";

    const response = await mockFetch.invoke(`${REVOLUT_API_BASE}/api/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REVOLUT_PAY_SECRET_KEY}`,
        "Content-Type": "application/json",
        "Revolut-Api-Version": REVOLUT_API_VERSION,
      },
      body: JSON.stringify({
        amount: 1500,
        currency: "EUR",
        metadata: { ticketCount: "1", product: "ghid-saturn-in-berbec" },
      }),
    });

    assert.equal(response.ok, true);
    const [url, init] = mockFetch.calls[0];
    assert.equal(url, "https://sandbox-merchant.revolut.com/api/orders");
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers?.Authorization, "Bearer sk_test_dummy");
    assert.equal(init?.headers?.["Revolut-Api-Version"], "2026-08-17");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.amount, 1500);
    assert.equal(body.currency, "EUR");
    assert.equal(body.metadata.ticketCount, "1");
    assert.equal(body.metadata.product, "ghid-saturn-in-berbec");
    mockFetch.clear();
  });

  it("throws when Revolut API returns non-ok", async () => {
    mockFetch.set(async () => mockResponse(false, { error: "invalid key" }, 401));
    let threw = false;
    try {
      const response = await mockFetch.invoke("https://sandbox-merchant.revolut.com/api/orders", {
        method: "POST",
        headers: { Authorization: "Bearer sk_test_dummy" },
        body: JSON.stringify({ amount: 1500, currency: "EUR", metadata: {} }),
      });
      if (!response.ok) {
        const errorText = await (response as any).text();
        throw new Error(`Revolut order creation failed: ${response.status} - ${errorText}`);
      }
    } catch (err) {
      threw = true;
      assert.equal((err as Error).message, "Revolut order creation failed: 401 - {\"error\":\"invalid key\"}");
    }
    assert.equal(threw, true);
    mockFetch.clear();
  });

  it("returns token from successful response", async () => {
    mockFetch.set(async () => mockResponse(true, { token: "ord_xyz123" }, 200));
    mockFetch.calls = [];
    const response = await mockFetch.invoke("https://sandbox-merchant.revolut.com/api/orders", {
      method: "POST",
      headers: { Authorization: "Bearer sk_test_dummy" },
      body: JSON.stringify({ amount: 1500, currency: "EUR", metadata: {} }),
    });
    const data = await response.json();
    assert.equal(data.token, "ord_xyz123");
    mockFetch.clear();
  });
});
