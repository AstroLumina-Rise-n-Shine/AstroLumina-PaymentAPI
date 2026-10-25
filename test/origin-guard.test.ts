import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { originGuard } from "../src/middleware/security.js";
import { FRONTEND_DC_PORT } from "./setup-env.js";

describe("originGuard", () => {
  function makeReq(origin?: string): any {
    return { headers: origin ? { origin } : {} };
  }
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

  it("passes requests without Origin", () => {
    let called = false;
    originGuard(makeReq(), makeRes(), () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it("passes an allowlisted origin (localhost frontend port)", () => {
    let called = false;
    originGuard(
      makeReq(`http://localhost:${FRONTEND_DC_PORT}`),
      makeRes(),
      () => {
        called = true;
      },
    );
    assert.equal(called, true);
  });

  it("rejects a foreign origin with 403", () => {
    let called = false;
    const res = makeRes();
    originGuard(makeReq("https://attacker.example"), res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });
});
