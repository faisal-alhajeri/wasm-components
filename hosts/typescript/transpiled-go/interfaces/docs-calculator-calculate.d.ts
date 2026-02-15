/** @module Interface docs:calculator/calculate@0.1.0 **/
export function evalExpression(op: Op, x: number, y: number): string;
export function evalExpressionDetailed(op: Op, x: number, y: number): CalcResult;
export function generateFibonacci(maxCount: number): void;
export function generateSquares(maxCount: number): void;
export function generatePrimes(maxCount: number): void;
/**
 * # Variants
 * 
 * ## `"add"`
 * 
 * ## `"sub"`
 * 
 * ## `"mul"`
 */
export type Op = 'add' | 'sub' | 'mul';
export interface CalcResult {
  value: number,
  op: string,
  x: number,
  y: number,
}

export class CalcSession {
  constructor()
  pushOp(op: Op, value: number): void;
  getCurrent(): number;
  getHistory(): Array<CalcResult>;
  reset(): void;
}

export class NumberStream {
  constructor()
  startFibonacci(): void;
  startSquares(): void;
  startPrimes(): void;
  read(count: number): Uint32Array;
  stop(): void;
}
