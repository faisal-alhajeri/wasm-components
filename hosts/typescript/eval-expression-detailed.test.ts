import { describe, it, before } from "node:test";
import assert from "node:assert";
import type { Root } from "./transpiled/go/composed-go.js";
import { getCalculate } from "./setup.js";

describe("eval-expression-detailed (go)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("go");
    calculate = c;
  });

  it("add(3,7)", () => {
    const r = calculate.evalExpressionDetailed("add", 3, 7);
    assert.strictEqual(r.value, 10);
    assert.strictEqual(r.op, "add");
    assert.strictEqual(r.x, 3);
    assert.strictEqual(r.y, 7);
  });
  it("mul(6,7)", () => {
    const r = calculate.evalExpressionDetailed("mul", 6, 7);
    assert.strictEqual(r.value, 42);
    assert.strictEqual(r.op, "mul");
    assert.strictEqual(r.x, 6);
    assert.strictEqual(r.y, 7);
  });
});

describe("eval-expression-detailed (js)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("js");
    calculate = c;
  });

  it("add(3,7)", () => {
    const r = calculate.evalExpressionDetailed("add", 3, 7);
    assert.strictEqual(r.value, 10);
    assert.strictEqual(r.op, "add");
    assert.strictEqual(r.x, 3);
    assert.strictEqual(r.y, 7);
  });
  it("mul(6,7)", () => {
    const r = calculate.evalExpressionDetailed("mul", 6, 7);
    assert.strictEqual(r.value, 42);
    assert.strictEqual(r.op, "mul");
    assert.strictEqual(r.x, 6);
    assert.strictEqual(r.y, 7);
  });
});

describe("eval-expression-detailed (py)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("py");
    calculate = c;
  });

  it("add(3,7)", () => {
    const r = calculate.evalExpressionDetailed("add", 3, 7);
    assert.strictEqual(r.value, 10);
    assert.strictEqual(r.op, "add");
    assert.strictEqual(r.x, 3);
    assert.strictEqual(r.y, 7);
  });
  it("mul(6,7)", () => {
    const r = calculate.evalExpressionDetailed("mul", 6, 7);
    assert.strictEqual(r.value, 42);
    assert.strictEqual(r.op, "mul");
    assert.strictEqual(r.x, 6);
    assert.strictEqual(r.y, 7);
  });
});
