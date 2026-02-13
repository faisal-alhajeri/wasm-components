# Issues Faced and Resolutions

## 1. AssemblyScript Has No Component Model Support

**Problem:** The original plan called for AssemblyScript as one of the plugin languages. However, AssemblyScript has zero support for the WASM Component Model. There is no `wit-bindgen` for it, no canonical ABI tooling, and no community projects bridging the gap. Building a conformant component would require manually implementing the entire canonical ABI (string encoding, record layout, etc.), which is fragile and defeats the purpose of practicing the component model.

**Resolution:** Replaced AssemblyScript with JavaScript via `jco componentize`. JS embeds the SpiderMonkey engine into the component (~11MB overhead), but it has first-class component model support through the Bytecode Alliance toolchain.

---

## 2. TinyGo `wasip2` Target Forces WASI Imports

**Problem:** TinyGo's `wasip2` target is hardwired to `wasi:cli/command`. Even if your code doesn't use any WASI features, the compiled component will import `wasi:random`, `wasi:cli`, `wasi:filesystem`, etc. These imports must be satisfied by the host at runtime.

**Impact:** The composed Go component ended up with 11 WASI imports that had nothing to do with adding numbers.

**Resolution:** Switched to `tinygo -target=wasm-unknown` which produces a plain core WASM module with no WASI imports. Then used `wasm-tools component embed` + `wasm-tools component new` to manually wrap it into a component. This produces clean components with only the WIT-defined imports/exports.

Build pipeline:
```
tinygo build -target=wasm-unknown -o core.wasm .
wasm-tools component embed --world <name> wit core.wasm -o embedded.wasm
wasm-tools component new embedded.wasm -o component.wasm
```

---

## 3. wasmtime-py Hangs on Python 3.9 (macOS ARM64)

**Problem:** Component function calls (`Func.__call__`) hung indefinitely on Python 3.9.6 (the system Python on macOS). The call entered the C FFI (`wasmtime_component_func_call`) and never returned. Even the simplest call (`add(1, 2)` returning a `u32`) would hang. This affected both Go and JS components.

**Root Cause:** Known issue with wasmtime's use of Mach ports for exception handling when running inside Python 3.9 on macOS ARM64 (see [wasmtime#10099](https://github.com/bytecodealliance/wasmtime/issues/10099)). The signal handling in older Python versions conflicts with wasmtime's internal exception mechanisms.

**Resolution:** Used `uv` to create a project with Python 3.13 instead of the system Python 3.9. The hang disappeared completely with Python 3.13.

---

## 4. wasmtime-py `add_wasip2()` Missing `wasi:random` Support

**Problem:** When the Go components still had WASI imports (before switching to `wasm-unknown`), calling `linker.add_wasip2()` in wasmtime-py did not satisfy the `wasi:random/random@0.2.0` import. Instantiation failed with:

```
unknown import: `wasi:random/random@0.2.0#get-random-u64` has not been defined
```

**Additional issue:** Attempting to manually provide the missing import via `LinkerInstance.add_func()` caused a thread panic in wasmtime's C API (`store.rs:103 - called Option::unwrap() on a None value`).

**Resolution:** Eliminated the problem entirely by rebuilding Go plugins with `wasm-unknown` target (no WASI imports needed). This is the cleaner solution anyway since the plugins don't actually use any WASI functionality.

---

## 5. WASI Virt Version Mismatch

**Problem:** Before settling on the `wasm-unknown` approach, we attempted to use `wasi-virt` to stub out the WASI imports. However, `wasi-virt` exports WASI `@0.2.3` interfaces while TinyGo's `wasip2` target imports WASI `@0.2.0`. The version mismatch prevented `wasm-tools compose` from matching the virt layer's exports to the component's imports.

**Resolution:** Made irrelevant by switching to `wasm-unknown` (issue #2 resolution). If you do need WASI in the future, ensure the virt layer version matches what your toolchain produces.

---

## 6. `wkg wit fetch` / `wkg wit build` Registry Authentication Warnings

**Problem:** Running `wkg wit fetch` and `wkg wit build` produced "Invalid bearer token" warnings. The WASI deps still downloaded successfully from the OCI registry, but the warnings were noisy.

**Impact:** Cosmetic only - the tools worked despite the warnings.

**Resolution:** No action needed. The warnings come from the OCI registry's token cache and don't affect functionality. For local-only packages (like `docs:adder`), `wkg` cannot resolve them from a registry, which is expected. We placed local deps manually in `wit/deps/` directories.

---

## 7. `jco componentize` Required `@bytecodealliance/preview2-shim`

**Problem:** First attempt at `jco componentize` failed with:
```
Cannot find package '@bytecodealliance/preview2-shim'
```

**Resolution:** Installed it globally alongside jco:
```
npm install -g @bytecodealliance/preview2-shim
```

---

## 8. `wasm-tools compose` Deprecation Warning

**Problem:** Every `wasm-tools compose` invocation prints a deprecation warning recommending `wac` instead.

**Impact:** Functional - composition still works. `wac` is the successor but requires a `.wac` composition file or `wac plug` command.

**Resolution:** Left as-is since `wasm-tools compose` still works and is simpler for this use case. The Makefile can be updated to use `wac plug` in the future:
```
wac plug go-calculator.wasm --plug go-adder.wasm -o composed-go.wasm
```
