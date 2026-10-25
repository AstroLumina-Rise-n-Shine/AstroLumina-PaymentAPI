import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrigin,
  stripTrailingSlashes,
} from "../src/middleware/security.js";

describe("normalizeOrigin", () => {
  it("canonicalizes host and strips default ports", () => {
    assert.equal(
      normalizeOrigin("  https://AstroLumina.com/path?q=1  "),
      "https://astrolumina.com",
    );
  });

  it("returns null for non-http schemes and garbage", () => {
    assert.equal(normalizeOrigin("ftp://x"), null);
    assert.equal(normalizeOrigin("not-a-url"), null);
    assert.equal(normalizeOrigin(""), null);
  });

  it("strips trailing slashes before parsing", () => {
    assert.equal(normalizeOrigin("http://example.com///"), "http://example.com");
  });
});

describe("stripTrailingSlashes", () => {
  it("removes all trailing slashes", () => {
    assert.equal(stripTrailingSlashes("https://x///"), "https://x");
  });
  it("leaves strings without trailing slash untouched", () => {
    assert.equal(stripTrailingSlashes("abc"), "abc");
  });
});
