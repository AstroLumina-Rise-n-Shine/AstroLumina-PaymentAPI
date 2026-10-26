import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeOrigin } from "../src/middleware/security.js";

describe("unified payment coverage", () => {
  it("normalizes known safe origins", () => {
    assert.equal(normalizeOrigin("https://Example.Com/"), "https://example.com");
  });
});