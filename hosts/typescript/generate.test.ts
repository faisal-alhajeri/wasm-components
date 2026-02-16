import { describe, it, before } from "node:test";
import assert from "node:assert";
import type { Root } from "./transpiled/go/composed-go.js";
import { getCalculate } from "./setup.js";

describe("generate (go)", () => {
  let calculate: Root["calculate"];
  let collectedNumbers: number[];
  before(async () => {
    const ctx = await getCalculate("go");
    calculate = ctx.calculate;
    collectedNumbers = ctx.collectedNumbers;
  });

  it("generateFibonacci(10)", () => {
    collectedNumbers.length = 0;
    calculate.generateFibonacci(10);
    assert.deepStrictEqual(
      collectedNumbers,
      [1, 1, 2, 3, 5, 8, 13, 21, 34, 55]
    );
  });
  it("generateSquares(5)", () => {
    collectedNumbers.length = 0;
    calculate.generateSquares(5);
    assert.deepStrictEqual(collectedNumbers, [1, 4, 9, 16, 25]);
  });
  it("generatePrimes(5)", () => {
    collectedNumbers.length = 0;
    calculate.generatePrimes(5);
    assert.deepStrictEqual(collectedNumbers, [2, 3, 5, 7, 11]);
  });
});

describe("generate (js)", () => {
  let calculate: Root["calculate"];
  let collectedNumbers: number[];
  before(async () => {
    const ctx = await getCalculate("js");
    calculate = ctx.calculate;
    collectedNumbers = ctx.collectedNumbers;
  });

  it("generateFibonacci(10)", () => {
    collectedNumbers.length = 0;
    calculate.generateFibonacci(10);
    assert.deepStrictEqual(
      collectedNumbers,
      [1, 1, 2, 3, 5, 8, 13, 21, 34, 55]
    );
  });
  it("generateSquares(5)", () => {
    collectedNumbers.length = 0;
    calculate.generateSquares(5);
    assert.deepStrictEqual(collectedNumbers, [1, 4, 9, 16, 25]);
  });
  it("generatePrimes(5)", () => {
    collectedNumbers.length = 0;
    calculate.generatePrimes(5);
    assert.deepStrictEqual(collectedNumbers, [2, 3, 5, 7, 11]);
  });
});
