import { add, sub, mul } from "docs:adder/add@0.1.0";
import { onNumber, onDone } from "docs:calculator/stream-sink@0.1.0";
import * as Calc from "./types/interfaces/docs-calculator-calculate.js";

function compute(op: Calc.Op, x: number, y: number): number {
  switch (op) {
    case "add":
      return add(x, y);
    case "sub":
      return sub(x, y);
    case "mul":
      return mul(x, y);
    default:
      return 0;
  }
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function nextPrime(start: number): number {
  let n = start;
  while (!isPrime(n)) n++;
  return n;
}

type StreamConfig =
  | { kind: "fibonacci"; prev: number; curr: number }
  | { kind: "squares"; index: number }
  | { kind: "primes"; next: number }
  | { kind: null };

export const calculate: typeof Calc = {
  evalExpression(op: Calc.Op, x: number, y: number): string {
    const result = compute(op, x, y);
    return `the operation of ${x} ${op} ${y} = ${result}`;
  },

  evalExpressionDetailed(op: Calc.Op, x: number, y: number): Calc.CalcResult {
    const result = compute(op, x, y);
    return { value: result, op, x, y };
  },

  CalcSession: class CalcSession {
    current: number = 0;
    history: Calc.CalcResult[] = [];

    pushOp(op: Calc.Op, value: number): void {
      const result = compute(op, this.current, value);
      this.history.push({ value: result, op, x: this.current, y: value });
      this.current = result;
    }

    getCurrent(): number {
      return this.current;
    }

    getHistory(): Calc.CalcResult[] {
      return this.history;
    }

    reset(): void {
      this.current = 0;
      this.history = [];
    }
  },

  NumberStream: class NumberStream {
    config: StreamConfig = { kind: null };

    startFibonacci(): void {
      this.config = { kind: "fibonacci", prev: 0, curr: 1 };
    }

    startSquares(): void {
      this.config = { kind: "squares", index: 1 };
    }

    startPrimes(): void {
      this.config = { kind: "primes", next: 2 };
    }

    read(count: number): Uint32Array {
      const results = new Uint32Array(count);
      for (let i = 0; i < count; i++) {
        switch (this.config.kind) {
          case "fibonacci": {
            results[i] = this.config.curr;
            const next = this.config.prev + this.config.curr;
            this.config = { kind: "fibonacci", prev: this.config.curr, curr: next };
            break;
          }
          case "squares": {
            results[i] = this.config.index * this.config.index;
            this.config = { kind: "squares", index: this.config.index + 1 };
            break;
          }
          case "primes": {
            const p = nextPrime(this.config.next);
            results[i] = p;
            this.config = { kind: "primes", next: p + 1 };
            break;
          }
          default:
            return new Uint32Array(0);
        }
      }
      return results;
    }

    stop(): void {
      this.config = { kind: null };
    }
  },

  generateFibonacci(maxCount: number): void {
    let prev = 0,
      curr = 1;
    for (let i = 0; i < maxCount; i++) {
      const keepGoing = onNumber(curr);
      if (!keepGoing) break;
      const next = prev + curr;
      prev = curr;
      curr = next;
    }
    onDone();
  },

  generateSquares(maxCount: number): void {
    for (let i = 1; i <= maxCount; i++) {
      const keepGoing = onNumber(i * i);
      if (!keepGoing) break;
    }
    onDone();
  },

  generatePrimes(maxCount: number): void {
    let n = 2;
    let count = 0;
    while (count < maxCount) {
      if (isPrime(n)) {
        const keepGoing = onNumber(n);
        if (!keepGoing) break;
        count++;
      }
      n++;
    }
    onDone();
  },
};
