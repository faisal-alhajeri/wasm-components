import { add, sub, mul } from "docs:adder/add@0.1.0";
import { onNumber, onDone } from "docs:calculator/stream-sink@0.1.0";

function compute(op, x, y) {
  switch (op) {
    case "add": return add(x, y);
    case "sub": return sub(x, y);
    case "mul": return mul(x, y);
    default: return 0;
  }
}

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function nextPrime(start) {
  let n = start;
  while (!isPrime(n)) n++;
  return n;
}

export const calculate = {
  evalExpression(op, x, y) {
    const result = compute(op, x, y);
    return `the operation of ${x} ${op} ${y} = ${result}`;
  },

  evalExpressionDetailed(op, x, y) {
    const result = compute(op, x, y);
    return { value: result, op, x, y };
  },

  CalcSession: class CalcSession {
    constructor() {
      this.current = 0;
      this.history = [];
    }

    pushOp(op, value) {
      const result = compute(op, this.current, value);
      this.history.push({ value: result, op, x: this.current, y: value });
      this.current = result;
    }

    getCurrent() {
      return this.current;
    }

    getHistory() {
      return this.history;
    }

    reset() {
      this.current = 0;
      this.history = [];
    }
  },

  NumberStream: class NumberStream {
    constructor() {
      this.kind = null;
      this.state = {};
    }

    startFibonacci() {
      this.kind = "fibonacci";
      this.state = { prev: 0, curr: 1 };
    }

    startSquares() {
      this.kind = "squares";
      this.state = { index: 1 };
    }

    startPrimes() {
      this.kind = "primes";
      this.state = { next: 2 };
    }

    read(count) {
      const results = new Uint32Array(count);
      for (let i = 0; i < count; i++) {
        switch (this.kind) {
          case "fibonacci": {
            results[i] = this.state.curr;
            const next = this.state.prev + this.state.curr;
            this.state.prev = this.state.curr;
            this.state.curr = next;
            break;
          }
          case "squares": {
            results[i] = this.state.index * this.state.index;
            this.state.index++;
            break;
          }
          case "primes": {
            const p = nextPrime(this.state.next);
            results[i] = p;
            this.state.next = p + 1;
            break;
          }
          default:
            return new Uint32Array(0);
        }
      }
      return results;
    }

    stop() {
      this.kind = null;
      this.state = {};
    }
  },

  generateFibonacci(maxCount) {
    let prev = 0, curr = 1;
    for (let i = 0; i < maxCount; i++) {
      const keepGoing = onNumber(curr);
      if (!keepGoing) break;
      const next = prev + curr;
      prev = curr;
      curr = next;
    }
    onDone();
  },

  generateSquares(maxCount) {
    for (let i = 1; i <= maxCount; i++) {
      const keepGoing = onNumber(i * i);
      if (!keepGoing) break;
    }
    onDone();
  },

  generatePrimes(maxCount) {
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