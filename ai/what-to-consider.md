# What to Consider Next

Ideas and concepts to deepen your understanding of WASM components.

---

## 1. Understand the Two-Layer Architecture

The component model has two layers that are easy to conflate:

- **Core WASM module**: The raw bytecode your compiler produces. It only understands integers and floats. Strings are `(pointer, length)` pairs in linear memory.
- **Component wrapper**: The outer shell that describes typed interfaces (strings, enums, records, lists). The **canonical ABI** translates between the two.

When you ran `wasm-tools component embed` + `component new`, you were explicitly performing this wrapping. When `jco componentize` or `tinygo -target=wasip2` builds a component, they do it internally. Understanding this split is key to debugging component issues.

---

## 2. The Canonical ABI is the Real Magic

The component model's value proposition is that you never pass raw pointers across component boundaries. Instead, the canonical ABI defines how every WIT type maps to core WASM:

| WIT type | Canonical ABI representation |
|----------|------------------------------|
| `u32` | i32 directly |
| `string` | `(pointer: i32, length: i32)` in linear memory, UTF-8 encoded |
| `enum` | i32 discriminant (0, 1, 2...) |
| `record` | Flattened fields in order |
| `list<T>` | `(pointer: i32, length: i32)` |
| `result<T, E>` | Discriminant + payload |

The component wrapper handles all the lifting (core -> typed) and lowering (typed -> core) automatically. This is why cross-language interop works without glue code.

---

## 3. Composition vs. Runtime Linking

This project uses **static composition** (`wasm-tools compose`): the adder is baked into the calculator at build time. The host sees one self-contained binary.

The alternative is **runtime linking**: the host loads both components separately and satisfies the calculator's `docs:adder/add` import by wiring it to the adder's export at instantiation time. This is more flexible (swap implementations at runtime) but requires host-side plumbing.

Consider trying runtime linking in a future iteration. In wasmtime (Rust), this is done via the `Linker` API. In wasmtime-py, the `LinkerInstance.add_func()` API exists but is immature (we hit panics with it).

---

## 4. WASI is Optional, Not Required

A common misconception is that WASM components need WASI. They don't. WASI is just a set of standardized WIT interfaces for system capabilities (filesystem, network, random, clocks, etc.).

Your component only needs WASI if it actually uses those capabilities. A pure computation plugin (like our adder) has no business importing `wasi:random`. The cleanest components have zero WASI imports.

This is why `wasm-unknown` + manual wrapping produced better results than `wasip2` for this project. Reserve WASI for when you genuinely need system access.

---

## 5. Resources (Handles) - The Next Level of WIT

This project only uses value types (`u32`, `string`, `enum`). WIT also supports **resources**, which are opaque handles with methods:

```wit
interface db {
    resource connection {
        constructor(url: string);
        query: func(sql: string) -> list<row>;
        close: func();
    }
}
```

Resources let components manage stateful objects across the boundary. The host creates a resource, passes the handle to the component, and the component calls methods on it. This is essential for modeling things like database connections, file handles, or HTTP clients.

Consider adding a resource-based interface to a future iteration.

---

## 6. The `world` is the Component's API Contract

A WIT `world` defines what a component **imports** (what it needs from the environment) and **exports** (what it provides to the environment). Think of it as the component's "type signature."

- `world adder { export add; }` - "I provide add, I need nothing"
- `world calculator { export calculate; import docs:adder/add; }` - "I provide calculate, but I need add"
- `world app { import calculate; }` - "I need calculate" (the host's perspective)

The composition tool's job is to match exports to imports across worlds. If the types don't match exactly, composition fails.

---

## 7. Cross-Language Composition is the Real Power

In this project, Go and JS plugins are composed with their same-language counterparts. But the real power of the component model is **cross-language composition**: compose a Go adder with a JS calculator (or vice versa).

Try this:
```bash
wasm-tools compose build/js-calculator.wasm -d build/go-adder.wasm -o build/composed-cross.wasm
```

This should work because both conform to the same WIT contract. The hosts won't know or care that the adder is Go and the calculator is JS. This is the component model's killer feature.

---

## 8. Component Size Differences Tell a Story

Look at the build output sizes:

| Component | Size |
|-----------|------|
| Go adder (wasm-unknown) | ~18 KB |
| Go calculator (composed) | ~370 KB |
| JS adder (jco componentize) | ~11 MB |
| JS calculator (composed) | ~22 MB |

The JS components are ~600x larger because they embed the SpiderMonkey JS engine. This is the tradeoff: JS has great ergonomics for writing components, but the output is massive. For size-sensitive deployments (edge, serverless), Rust or Go produce much smaller components.

---

## 9. Versioning and Interface Evolution

Notice the `@0.1.0` in every WIT package. The component model has built-in versioning. When you change an interface, you bump the version. Consumers pinned to the old version keep working until they update.

Consider what happens if you add a `subtract` case to the `op` enum:
- Old calculator components that don't handle `subtract` still work (they just return "unknown operation")
- Old hosts that only pass `add` still work
- New hosts can pass `subtract` to new calculators

This is how the component model enables independent evolution of components.

---

## 10. Toolchain Maturity Varies Wildly

The component model toolchain is still maturing. Here's a realistic assessment:

| Language | Component Support | Maturity |
|----------|-------------------|----------|
| **Rust** (`cargo-component`, `wit-bindgen`) | First-class | Production-ready |
| **Go** (TinyGo + `wit-bindgen-go`) | Good with `wasip2` target, manual wrapping for `wasm-unknown` | Usable but rough edges |
| **JavaScript** (`jco componentize`) | Good | Usable, large output size |
| **Python** (`componentize-py`) | Guest only (building components FROM Python) | Experimental |
| **Python hosting** (`wasmtime-py`) | Low-level C API, bindgen removed | Immature, bugs |
| **C/C++** | `wit-bindgen` support | Usable |
| **C#** | `wit-bindgen` support | Early |
| **AssemblyScript** | None | Not viable |

If you want the smoothest experience, use Rust for plugins and Rust (wasmtime) for hosting. The other languages work but require more manual effort and have more sharp edges.

---

## 11. Try `wac` Instead of `wasm-tools compose`

`wasm-tools compose` is deprecated in favor of `wac` (WebAssembly Composition). `wac` provides a declarative language for expressing how components are wired together:

```wac
package example:composition;

let adder = new docs:adder {};
let calc = new docs:calculator { "docs:adder/add@0.1.0": adder.add };
export calc.calculate;
```

This is more explicit and powerful than the auto-matching of `wasm-tools compose`. Consider migrating the Makefile to use `wac` for a deeper understanding of composition.

---

## 12. Think About Error Handling

The current WIT uses `string` as the return type for `eval-expression`. In real-world interfaces, you'd use `result<T, E>`:

```wit
interface calculate {
    enum op { add }
    variant error { invalid-op, overflow }
    eval-expression: func(op: op, x: u32, y: u32) -> result<string, error>;
}
```

The `result` type maps naturally to error handling in every language (Go's `(val, err)`, Rust's `Result<T, E>`, JS's throw/catch via jco). Consider evolving the WIT to use `result` and `variant` types.

---

## 13. WASI Preview 2 vs Preview 1

WASI has two versions in the wild:
- **Preview 1** (wasip1): Uses core WASM module imports like `fd_write`. This is what `wasm32-wasi` targets.
- **Preview 2** (wasip2): Uses the component model with WIT-defined interfaces like `wasi:filesystem/types`. This is what `wasm32-wasip2` targets.

Preview 2 is the future. All new development should target it. Preview 1 is legacy. The adapter layer (`wasi_snapshot_preview1.reactor.wasm`) can bridge p1 modules into p2 components, but it's better to go native p2.

---

## 14. The Registry Ecosystem (warg, wa.dev)

Components are designed to be published to registries, similar to npm or crates.io. The `wkg` tool can fetch WIT packages and component binaries from OCI registries. The nascent `wa.dev` registry is where the community is heading.

Consider publishing your adder component to a local registry and having the calculator fetch it via `wkg` instead of copying WIT files around manually. This is how real multi-team component development will work.
