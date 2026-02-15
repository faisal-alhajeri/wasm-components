"""
Python host for WASM calculator components.

Usage:
    uv run python3 host.py <path-to-composed-component.wasm>

Example:
    uv run python3 host.py ../../build/composed-go.wasm
    uv run python3 host.py ../../build/composed-js.wasm
"""

import sys
import os
from wasmtime import Engine, Store
from wasmtime.component import Component, Linker


def run(wasm_path: str):
    engine = Engine()
    store = Store(engine)

    # Set up linker
    linker = Linker(engine)

    # Stream-sink implementation
    collected_numbers = []

    def on_number_handler(store, value: int) -> bool:
        collected_numbers.append(value)
        return True

    def on_done_handler(store):
        pass

    # Register stream-sink implementation
    try:
        with linker.root() as root:
            sink = root.add_instance("docs:calculator/stream-sink@0.1.0")
            sink.add_func("on-number", on_number_handler)
            sink.add_func("on-done", on_done_handler)
    except Exception as e:
        print(f"Warning: Could not register stream-sink: {e}")
        print("Streaming features may not work")

    # Load the composed component
    component = Component.from_file(engine, wasm_path)

    # Instantiate the component
    instance = linker.instantiate(store, component)

    # Navigate to the exported interface: docs:calculator/calculate@0.1.0
    iface_idx = instance.get_export_index(store, "docs:calculator/calculate@0.1.0")
    if iface_idx is None:
        print("Error: could not find export 'docs:calculator/calculate@0.1.0'")
        sys.exit(1)

    # Get the eval-expression function
    func_idx = instance.get_export_index(store, "eval-expression", iface_idx)
    if func_idx is None:
        print("Error: could not find function 'eval-expression'")
        sys.exit(1)

    eval_expr = instance.get_func(store, func_idx)
    if eval_expr is None:
        print("Error: could not get function 'eval-expression'")
        sys.exit(1)

    # Test basic operations
    result = eval_expr(store, "add", 1, 2)
    eval_expr.post_return(store)
    print(f"add(1,2) = {result}")

    result = eval_expr(store, "sub", 10, 3)
    eval_expr.post_return(store)
    print(f"sub(10,3) = {result}")

    result = eval_expr(store, "mul", 4, 5)
    eval_expr.post_return(store)
    print(f"mul(4,5) = {result}")

    print(
        "\nNote: Full feature testing (resources, streaming) to be added after successful build"
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: uv run python3 {sys.argv[0]} <path-to-composed-component.wasm>")
        sys.exit(1)

    wasm_path = sys.argv[1]
    if not os.path.exists(wasm_path):
        print(f"Error: file not found: {wasm_path}")
        sys.exit(1)

    run(wasm_path)
