from __future__ import annotations

from wit_calc.imports.add import add, sub, mul
from wit_calc.imports import stream_sink
from wit_calc.exports import Calculate as CalculateProtocol
from wit_calc.exports.calculate import (
    Op,
    CalcResult,
    CalcSession as CalcSessionProtocol,
    NumberStream as NumberStreamProtocol,
)


def _compute(op: Op, x: int, y: int) -> int:
    if op == Op.ADD:
        return add(x, y)
    if op == Op.SUB:
        return sub(x, y)
    if op == Op.MUL:
        return mul(x, y)
    return 0


def _is_prime(n: int) -> bool:
    if n < 2:
        return False
    i = 2
    while i * i <= n:
        if n % i == 0:
            return False
        i += 1
    return True


def _next_prime(start: int) -> int:
    n = start
    while not _is_prime(n):
        n += 1
    return n


class CalcSession(CalcSessionProtocol):
    def __init__(self) -> None:
        self._current: int = 0
        self._history: list[CalcResult] = []

    def push_op(self, op: Op, value: int) -> None:
        result = _compute(op, self._current, value)
        op_str = "add" if op == Op.ADD else "sub" if op == Op.SUB else "mul"
        self._history.append(CalcResult(value=result, op=op_str, x=self._current, y=value))
        self._current = result

    def get_current(self) -> int:
        return self._current

    def get_history(self) -> list[CalcResult]:
        return list(self._history)

    def reset(self) -> None:
        self._current = 0
        self._history.clear()


class NumberStream(NumberStreamProtocol):
    def __init__(self) -> None:
        self._kind: str | None = None
        self._fib_prev: int = 0
        self._fib_curr: int = 1
        self._index: int = 0
        self._next_prime: int = 2

    def start_fibonacci(self) -> None:
        self._kind = "fibonacci"
        self._fib_prev = 0
        self._fib_curr = 1

    def start_squares(self) -> None:
        self._kind = "squares"
        self._index = 1

    def start_primes(self) -> None:
        self._kind = "primes"
        self._next_prime = 2

    def read(self, count: int) -> list[int]:
        result: list[int] = []
        for _ in range(count):
            if self._kind == "fibonacci":
                result.append(self._fib_curr)
                nxt = self._fib_prev + self._fib_curr
                self._fib_prev = self._fib_curr
                self._fib_curr = nxt
            elif self._kind == "squares":
                result.append(self._index * self._index)
                self._index += 1
            elif self._kind == "primes":
                p = _next_prime(self._next_prime)
                result.append(p)
                self._next_prime = p + 1
            else:
                break
        return result

    def stop(self) -> None:
        self._kind = None


class Calculate(CalculateProtocol):
    def eval_expression(self, op: Op, x: int, y: int) -> str:
        r = _compute(op, x, y)
        op_str = "add" if op == Op.ADD else "sub" if op == Op.SUB else "mul"
        return f"the operation of {x} {op_str} {y} = {r}"

    def eval_expression_detailed(self, op: Op, x: int, y: int) -> CalcResult:
        r = _compute(op, x, y)
        op_str = "add" if op == Op.ADD else "sub" if op == Op.SUB else "mul"
        return CalcResult(value=r, op=op_str, x=x, y=y)

    def generate_fibonacci(self, max_count: int) -> None:
        prev, curr = 0, 1
        for _ in range(max_count):
            if not stream_sink.on_number(curr):
                break
            prev, curr = curr, prev + curr
        stream_sink.on_done()

    def generate_squares(self, max_count: int) -> None:
        for i in range(1, max_count + 1):
            if not stream_sink.on_number(i * i):
                break
        stream_sink.on_done()

    def generate_primes(self, max_count: int) -> None:
        n = 2
        count = 0
        while count < max_count:
            if _is_prime(n):
                if not stream_sink.on_number(n):
                    break
                count += 1
            n += 1
        stream_sink.on_done()
