"""
Python host for WASM calculator components (reactor mode).

Uses wasmtime-py's component model API to load a composed calculator
component and call its exported eval-expression function.

Usage:
    uv run python3 host.py <path-to-composed-component.wasm>

Example:
    uv run python3 host.py ../../build/composed-go.wasm
    uv run python3 host.py ../../build/composed-js.wasm
"""

import sys
import os
from wasmtime import Engine, Store, Config
from wasmtime.component import Component, Linker


def run(wasm_path: str):
    # Enable the component model
    config = Config()
    config.wasm_component_model = True
    engine = Engine(config)
    store = Store(engine)

    # Load the composed component
    component = Component.from_file(engine, wasm_path)

    # Set up linker (no WASI needed - components are built without WASI imports)
    linker = Linker(engine)

    # Instantiate the component (reactor mode: no _start, just exports)
    instance = linker.instantiate(store, component)

    # Navigate to the exported interface: docs:calculator/calculate@0.1.0
    iface_idx = instance.get_export_index(store, "docs:calculator/calculate@0.1.0")
    if iface_idx is None:
        print("Error: could not find export 'docs:calculator/calculate@0.1.0'")
        sys.exit(1)

    # Get the eval-expression function from the interface
    func_idx = instance.get_export_index(store, "eval-expression", iface_idx)
    if func_idx is None:
        print("Error: could not find function 'eval-expression'")
        sys.exit(1)

    eval_expr = instance.get_func(store, func_idx)
    if eval_expr is None:
        print("Error: could not get function 'eval-expression'")
        sys.exit(1)

    # Call eval-expression with op="add", x=1, y=2
    # The WIT enum 'op' is passed as a string matching the enum case name
    result = eval_expr(store, "add", 1, 2)
    eval_expr.post_return(store)
    print(f"Result: {result}")

    # Try a few more examples
    result2 = eval_expr(store, "add", 100, 200)
    eval_expr.post_return(store)
    print(f"Result: {result2}")

    result3 = eval_expr(store, "add", 0, 0)
    eval_expr.post_return(store)
    print(f"Result: {result3}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: uv run python3 {sys.argv[0]} <path-to-composed-component.wasm>")
        sys.exit(1)

    wasm_path = sys.argv[1]
    if not os.path.exists(wasm_path):
        print(f"Error: file not found: {wasm_path}")
        sys.exit(1)

    run(wasm_path)
