# Project Requirements

## Goal

Build a WASM Component Model practice project with plugins written in multiple languages and hosts that consume them, following the WIT-defined contracts.

## WIT Contracts (Source of Truth: `/wit`)

### `docs:adder@0.1.0`
- Exports an `add` interface with: `add(x: u32, y: u32) -> u32`

### `docs:calculator@0.1.0`
- Exports a `calculate` interface with: `eval-expression(op: op, x: u32, y: u32) -> string`
- Contains an `op` enum with a single case: `add`
- Imports `docs:adder/add@0.1.0` (the calculator depends on the adder)
- The return string format: `"the operation of <x> add <y> = <result>"`

### `app` world (host perspective)
- Imports `calculate` interface (hosts consume the calculator)

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `/wit` | Shared WIT definitions (source of truth) |
| `/plugins` | Plugin implementations in different languages |
| `/plugins/go` | Go plugins (TinyGo) |
| `/plugins/js` | JavaScript plugins (jco componentize) |
| `/hosts` | Host applications that load and run the composed components |
| `/hosts/python` | Python host using wasmtime-py |
| `/hosts/typescript` | TypeScript host using jco transpile |
| `/build` | Build output directory for .wasm files |

## Plugin Requirements

### Language Choices
- **Go** (via TinyGo) - compiles to `wasm-unknown` target, then wrapped into a component via `wasm-tools`
- **JavaScript** (via jco componentize) - chosen instead of AssemblyScript because AssemblyScript has no component model support

### Both Languages Must Implement Both Plugins
- Adder plugin (4 total: Go adder, JS adder)
- Calculator plugin (4 total: Go calculator, JS calculator)
- Each plugin must conform to its WIT world

### Technical Constraints
- No direct memory access - return native WIT types only (`u32`, `string`, `enum`)
- Keep code simple and minimal
- Components must follow the WASM Component Model standard

## Composition

- Use `wasm-tools compose` to statically link each calculator with its corresponding adder
- Produces self-contained composed components (no unresolved imports except optionally WASI)
- Final composed components export only `docs:calculator/calculate@0.1.0`

## Host Requirements

### Reactor Mode
- Both hosts must use reactor mode (no `_start` / `run` entry point)
- Hosts call exported functions on demand
- Components act as libraries, not executables

### Python Host
- Uses `wasmtime-py` (v41+) with the component model API
- Managed via `uv` with Python 3.13+
- Loads any composed component and calls `eval-expression`

### TypeScript Host
- Uses `jco transpile` to convert components into importable ES modules
- Runs with Node.js (ESM mode)
- Dynamically imports the transpiled component

## Build Automation

- A top-level `Makefile` orchestrates all builds
- Targets: `plugins-go`, `plugins-js`, `compose`, `hosts-transpile`, `run-all`, `clean`
- `make all` builds everything from scratch
- `make run-all` runs all 4 host+component combinations
