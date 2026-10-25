import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getProduct, getAvailableProducts } from "../src/types/products.js";
import { normalizeOrigin } from "../src/middleware/security.js";

describe("unified payment coverage", () => {
  it("offers a non-empty product catalog", () => {
    const products = getAvailableProducts();
    assert.ok(products.length >= 4);
    assert.ok(getProduct(products[0]));
  });

  it("normalizes known safe origins", () => {
    assert.equal(normalizeOrigin("https://Example.Com/"), "https://example.com");
  });
});
