import { describe, it, before } from "node:test";
import assert from "node:assert";
import type { Root } from "./transpiled/go/composed-go.js";
import { getCalculate } from "./setup.js";

describe("calc-session (go)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("go");
    calculate = c;
  });

  it("push-op and get-current", () => {
    const session = new calculate.CalcSession();
    session.pushOp("add", 10);
    assert.strictEqual(session.getCurrent(), 10);
    session.pushOp("mul", 3);
    assert.strictEqual(session.getCurrent(), 30);
    session.pushOp("sub", 5);
    assert.strictEqual(session.getCurrent(), 25);
  });
  it("get-history", () => {
    const session = new calculate.CalcSession();
    session.pushOp("add", 10);
    session.pushOp("mul", 3);
    session.pushOp("sub", 5);
    const history = session.getHistory();
    assert.strictEqual(history.length, 3);
    assert.strictEqual(history[0].op, "add");
    assert.strictEqual(history[0].x, 0);
    assert.strictEqual(history[0].y, 10);
    assert.strictEqual(history[0].value, 10);
    assert.strictEqual(history[1].op, "mul");
    assert.strictEqual(history[1].x, 10);
    assert.strictEqual(history[1].y, 3);
    assert.strictEqual(history[1].value, 30);
    assert.strictEqual(history[2].op, "sub");
    assert.strictEqual(history[2].x, 30);
    assert.strictEqual(history[2].y, 5);
    assert.strictEqual(history[2].value, 25);
  });
  it("reset", () => {
    const session = new calculate.CalcSession();
    session.pushOp("add", 10);
    session.reset();
    assert.strictEqual(session.getCurrent(), 0);
  });
});

describe("calc-session (js)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("js");
    calculate = c;
  });

  it("push-op and get-current", () => {
    const session = new calculate.CalcSession();
    session.pushOp("add", 10);
    assert.strictEqual(session.getCurrent(), 10);
    session.pushOp("mul", 3);
    assert.strictEqual(session.getCurrent(), 30);
    session.pushOp("sub", 5);
    assert.strictEqual(session.getCurrent(), 25);
  });
  it("get-history", () => {
    const session = new calculate.CalcSession();
    session.pushOp("add", 10);
    session.pushOp("mul", 3);
    session.pushOp("sub", 5);
    const history = session.getHistory();
    assert.strictEqual(history.length, 3);
    assert.strictEqual(history[0].op, "add");
    assert.strictEqual(history[0].x, 0);
    assert.strictEqual(history[0].y, 10);
    assert.strictEqual(history[0].value, 10);
  });
  it("reset", () => {
    const session = new calculate.CalcSession();
    session.pushOp("add", 10);
    session.reset();
    assert.strictEqual(session.getCurrent(), 0);
  });
});
