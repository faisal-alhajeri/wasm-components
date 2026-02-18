import { describe, it, before } from "node:test";
import assert from "node:assert";
import type { Root } from "./transpiled/go/composed-go.js";
import { getCalculate } from "./setup.js";

describe("number-stream (go)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("go");
    calculate = c;
  });

  it("fibonacci read batches", () => {
    const stream = new calculate.NumberStream();
    stream.startFibonacci();
    const batch1 = stream.read(5);
    assert.deepStrictEqual(Array.from(batch1), [1, 1, 2, 3, 5]);
    const batch2 = stream.read(5);
    assert.deepStrictEqual(Array.from(batch2), [8, 13, 21, 34, 55]);
    stream.stop();
  });
  it("squares", () => {
    const stream = new calculate.NumberStream();
    stream.startSquares();
    const squares = stream.read(5);
    assert.deepStrictEqual(Array.from(squares), [1, 4, 9, 16, 25]);
    stream.stop();
  });
  it("primes", () => {
    const stream = new calculate.NumberStream();
    stream.startPrimes();
    const primes = stream.read(5);
    assert.deepStrictEqual(Array.from(primes), [2, 3, 5, 7, 11]);
    stream.stop();
  });
});

describe("number-stream (js)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("js");
    calculate = c;
  });

  it("fibonacci read batches", () => {
    const stream = new calculate.NumberStream();
    stream.startFibonacci();
    const batch1 = stream.read(5);
    assert.deepStrictEqual(Array.from(batch1), [1, 1, 2, 3, 5]);
    const batch2 = stream.read(5);
    assert.deepStrictEqual(Array.from(batch2), [8, 13, 21, 34, 55]);
    stream.stop();
  });
  it("squares", () => {
    const stream = new calculate.NumberStream();
    stream.startSquares();
    const squares = stream.read(5);
    assert.deepStrictEqual(Array.from(squares), [1, 4, 9, 16, 25]);
    stream.stop();
  });
  it("primes", () => {
    const stream = new calculate.NumberStream();
    stream.startPrimes();
    const primes = stream.read(5);
    assert.deepStrictEqual(Array.from(primes), [2, 3, 5, 7, 11]);
    stream.stop();
  });
});

describe("number-stream (py)", () => {
  let calculate: Root["calculate"];
  before(async () => {
    const { calculate: c } = await getCalculate("py");
    calculate = c;
  });

  it("fibonacci read batches", () => {
    const stream = new calculate.NumberStream();
    stream.startFibonacci();
    const batch1 = stream.read(5);
    assert.deepStrictEqual(Array.from(batch1), [1, 1, 2, 3, 5]);
    const batch2 = stream.read(5);
    assert.deepStrictEqual(Array.from(batch2), [8, 13, 21, 34, 55]);
    stream.stop();
  });
  it("squares", () => {
    const stream = new calculate.NumberStream();
    stream.startSquares();
    const squares = stream.read(5);
    assert.deepStrictEqual(Array.from(squares), [1, 4, 9, 16, 25]);
    stream.stop();
  });
  it("primes", () => {
    const stream = new calculate.NumberStream();
    stream.startPrimes();
    const primes = stream.read(5);
    assert.deepStrictEqual(Array.from(primes), [2, 3, 5, 7, 11]);
    stream.stop();
  });
});
