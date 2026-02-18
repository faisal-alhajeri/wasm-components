from __future__ import annotations

from wit_world import exports


class Add(exports.Add):
    def add(self, x: int, y: int) -> int:
        return x + y

    def sub(self, x: int, y: int) -> int:
        return x - y

    def mul(self, x: int, y: int) -> int:
        return x * y
