def test_eval_expression_detailed_add(wasm_component):
    ctx = wasm_component
    f = ctx.get_func("eval-expression-detailed")
    assert f is not None
    r = f(ctx.store, "add", 3, 7)
    f.post_return(ctx.store)
    assert r.value == 10
    assert r.op == "add"
    assert r.x == 3
    assert r.y == 7


def test_eval_expression_detailed_mul(wasm_component):
    ctx = wasm_component
    f = ctx.get_func("eval-expression-detailed")
    assert f is not None
    r = f(ctx.store, "mul", 6, 7)
    f.post_return(ctx.store)
    assert r.value == 42
    assert r.op == "mul"
    assert r.x == 6
    assert r.y == 7
