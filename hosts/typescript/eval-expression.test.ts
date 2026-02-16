import { describe, it, before } from "node:test";
import assert from "node:assert";
import { getCalculate } from "./setup.js";

describe("eval-expression (go)", () => {
  let calculate: any;
  before(async () => {
    const { calculate: c } = await getCalculate("go");
    calculate = c;
  });

  it("add(1,2) = 3", () => {
    assert.strictEqual(
      calculate.evalExpression("add", 1, 2),
      "the operation of 1 add 2 = 3"
    );
  });
  it("sub(10,3) = 7", () => {
    assert.strictEqual(
      calculate.evalExpression("sub", 10, 3),
      "the operation of 10 sub 3 = 7"
    );
  });
  it("mul(4,5) = 20", () => {
    assert.strictEqual(
      calculate.evalExpression("mul", 4, 5),
      "the operation of 4 mul 5 = 20"
    );
  });
});

describe("eval-expression (js)", () => {
  let calculate: any;
  before(async () => {
    const { calculate: c } = await getCalculate("js");
    calculate = c;
  });

  it("add(1,2) = 3", () => {
    assert.strictEqual(
      calculate.evalExpression("add", 1, 2),
      "the operation of 1 add 2 = 3"
    );
  });
  it("sub(10,3) = 7", () => {
    assert.strictEqual(
      calculate.evalExpression("sub", 10, 3),
      "the operation of 10 sub 3 = 7"
    );
  });
  it("mul(4,5) = 20", () => {
    assert.strictEqual(
      calculate.evalExpression("mul", 4, 5),
      "the operation of 4 mul 5 = 20"
    );
  });
});
