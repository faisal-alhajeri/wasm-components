import os
import pytest
from wasmtime import Engine, Store, WasiConfig
from wasmtime.component import Component, Linker

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BUILD_DIR = os.path.join(_SCRIPT_DIR, "..", "..", "build")


@pytest.fixture(params=["go", "js"])
def wasm_component(request):
    variant = request.param
    wasm_path = os.path.join(_BUILD_DIR, f"composed-{variant}.wasm")
    if not os.path.exists(wasm_path):
        pytest.skip(f"WASM file not found: {wasm_path} (run 'make compose')")

    engine = Engine()
    store = Store(engine)
    store.set_wasi(WasiConfig())
    component = Component.from_file(engine, wasm_path)

    linker = Linker(engine)
    linker.add_wasip2()
    collected_numbers = []

    def on_number(_store, value):
        collected_numbers.append(value)
        return True

    def on_done(_store):
        pass

    with linker.root() as root:
        with root.add_instance("docs:calculator/stream-sink@0.1.0") as sink:
            sink.add_func("on-number", on_number)
            sink.add_func("on-done", on_done)

    instance = linker.instantiate(store, component)
    iface_idx = instance.get_export_index(store, "docs:calculator/calculate@0.1.0")
    if iface_idx is None:
        pytest.fail("export 'docs:calculator/calculate@0.1.0' not found")

    def get_func(name, parent=iface_idx):
        idx = instance.get_export_index(store, name, parent)
        if idx is None:
            return None
        return instance.get_func(store, idx)

    class Ctx:
        pass

    ctx = Ctx()
    ctx.store = store
    ctx.get_func = get_func
    ctx.collected_numbers = collected_numbers
    return ctx
