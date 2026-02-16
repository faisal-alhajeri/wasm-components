# Agent Guide: WASM Component Model Project

This repository explores the WebAssembly (WASM) Component Model, featuring plugins in Go and JavaScript, composition via `wac-cli`, and hosts in Python and TypeScript.

the goal here is to learn the Component Model so we will do stuff only for learning.

## 1. Build, Lint, and Test Commands

The project uses a `Makefile` in `tests/components/` to orchestrate builds and runs.

### Prerequisites

- **TinyGo** (>= 0.33)
- **wasm-tools** (for component new/embed)
- **wac-cli** (for component composition)
- **jco** & **@bytecodealliance/componentize-js** (global npm)
- **uv** (Python package manager)
- **Node.js** (>= 22)

### Build Commands

Run these from `tests/components/`:

- **Build all:**
  ```bash
  make all
  ```
- **Build Go plugins only:**
  ```bash
  make plugins-go
  ```
- **Build JS plugins only:**
  ```bash
  make plugins-js
  ```
- **Compose components:**
  ```bash
  make compose
  ```
- **Transpile for TS host:**
  ```bash
  make hosts-transpile
  ```

### Run/Test Commands

Each host can run against the composed components (Go or JS variants).

- **Run All Tests:**
  ```bash
  make run-all
  ```
- **Run Python Tests (pytest, both Go/JS variants):**
  ```bash
  make run-python
  ```
- **Run TypeScript Tests (node:test, both Go/JS variants):**
  ```bash
  make run-ts
  ```
- **Clean Artifacts:**
  ```bash
  make clean
  ```

## 2. Code Style & Conventions

### General

- **Structure:**
  - `plugins/`: Source code for WASM components (Go, JS).
  - `hosts/`: Host applications (Python, TypeScript).
  - `wit/`: WIT (Wasm Interface Type) definitions.
  - `build/`: Generated WASM artifacts.
- **Paths:** Always use relative paths resolving correctly from the execution context (usually `tests/components/`).

### Go (Plugins)

- **Compiler:** `tinygo build -target=wasm-unknown`.
- **Bindings:** Use `go tool wit-bindgen-go` (via `//go:generate`).
- **Exports:**
  - Define exports in the `init()` function.
  - Assign to `package.Exports.MethodName`.
  - Example:
    ```go
    import "components-adder-go/gen/docs/adder/add"
    func init() {
        add.Exports.Add = func(x uint32, y uint32) uint32 { return x + y }
    }
    ```
- **Formatting:** Standard `gofmt`.

### JavaScript (Plugins)

- **Tooling:** `jco componentize` to create the WASM component.
- **Modules:** Use ES Modules (`export const ...`).
- **Structure:** Export objects matching the WIT interface names.
- **Example:**
  ```javascript
  export const add = {
    add(x, y) {
      return x + y;
    }, // Implementation matches WIT
  };
  ```

### TypeScript (Host)

- **Execution:** Node.js with `--experimental-wasm-type-reflection`.
- **Transpilation:** Consumes output from `jco transpile`.
- **Imports:** Dynamic imports for flexibility (e.g., `await import("./transpiled-go/...")`).
- **Type Safety:** Leverage generated types from `jco`.
- **Formatting:** Standard JS/TS conventions (semicolons, 2-space indent).
- **Error Handling:** Check process arguments and handle invalid variants gracefully.

### Python (Host)

- **Runtime:** `wasmtime` library.
- **Dependency Management:** Use `uv`.
- **Component Loading:**
  - Enable component model: `config.wasm_component_model = True`.
  - Use `Linker(engine)` and `instantiate(store, component)`.
- **Exports Access:**
  - Explicitly navigate exports: `instance.get_export_index` -> `get_func`.
  - Check for `None` to handle missing exports/functions safely.
- **Main Guard:** Always use `if __name__ == "__main__":`.
- **Usage:** CLI arguments for WASM file path.

### WIT (Wasm Interface Type)

- **Location:** `wit/` directory or inside plugin directories.
- **Naming:** Kebab-case for file names and identifiers.
- **Worlds:** Define explicitly what is imported and exported.

## 3. Workflow for Agents

1.  **Modify WIT:** If interfaces change, update `wit/*.wit` files first.
2.  **Regenerate Bindings:** Run generation commands (e.g., `go generate`) if applicable.
3.  **Implement:** Update plugin code (Go/JS).
4.  **Build:** Run `make plugins-<lang>` and `make compose`.
5.  **Update Host:** Adjust host code if signatures changed.
6.  **Verify:** Run `make run-all` to ensure end-to-end functionality.
