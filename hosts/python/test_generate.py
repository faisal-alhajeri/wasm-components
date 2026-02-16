from conftest import WasmCtx


def test_generate_fibonacci(wasm_component: WasmCtx) -> None:
    ctx = wasm_component
    f = ctx.get_func("generate-fibonacci")
    assert f is not None
    ctx.collected_numbers.clear()
    f(ctx.store, 10)
    f.post_return(ctx.store)
    assert ctx.collected_numbers == [1, 1, 2, 3, 5, 8, 13, 21, 34, 55]


def test_generate_squares(wasm_component: WasmCtx) -> None:
    ctx = wasm_component
    f = ctx.get_func("generate-squares")
    assert f is not None
    ctx.collected_numbers.clear()
    f(ctx.store, 5)
    f.post_return(ctx.store)
    assert ctx.collected_numbers == [1, 4, 9, 16, 25]


def test_generate_primes(wasm_component: WasmCtx) -> None:
    ctx = wasm_component
    f = ctx.get_func("generate-primes")
    assert f is not None
    ctx.collected_numbers.clear()
    f(ctx.store, 5)
    f.post_return(ctx.store)
    assert ctx.collected_numbers == [2, 3, 5, 7, 11]
