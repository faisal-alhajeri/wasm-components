from conftest import WasmCtx


def test_eval_expression_add(wasm_component: WasmCtx) -> None:
    ctx = wasm_component
    f = ctx.get_func("eval-expression")
    assert f is not None
    r = f(ctx.store, "add", 1, 2)
    f.post_return(ctx.store)
    assert r == "the operation of 1 add 2 = 3"


def test_eval_expression_sub(wasm_component: WasmCtx) -> None:
    ctx = wasm_component
    f = ctx.get_func("eval-expression")
    assert f is not None
    r = f(ctx.store, "sub", 10, 3)
    f.post_return(ctx.store)
    assert r == "the operation of 10 sub 3 = 7"


def test_eval_expression_mul(wasm_component: WasmCtx) -> None:
    ctx = wasm_component
    f = ctx.get_func("eval-expression")
    assert f is not None
    r = f(ctx.store, "mul", 4, 5)
    f.post_return(ctx.store)
    assert r == "the operation of 4 mul 5 = 20"
