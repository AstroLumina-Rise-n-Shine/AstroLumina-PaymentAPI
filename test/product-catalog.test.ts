import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getProduct, getAvailableProducts } from "../src/types/products.js";

describe("product catalog", () => {
  it("lists at least four products", () => {
    const products = getAvailableProducts();
    assert.ok(products.length >= 4);
    assert.ok(products.includes("soarele-stralucirea-ta"));
  });

  it("returns the config for a known product", () => {
    const product = getProduct("soarele-stralucirea-ta");
    assert.ok(product);
    assert.equal(product!.name, "Soarele Stralucirea Ta");
    assert.ok(typeof product!.priceId === "string");
  });

  it("returns undefined for an unknown product", () => {
    assert.equal(getProduct("does-not-exist"), undefined);
  });

  it("does not expose duplicate product keys", () => {
    const keys = getAvailableProducts();
    assert.equal(new Set(keys).size, keys.length);
  });
});
