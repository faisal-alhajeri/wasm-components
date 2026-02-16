def test_calc_session(wasm_component):
    ctx = wasm_component
    ctor = ctx.get_func("[constructor]calc-session")
    assert ctor is not None
    push_op = ctx.get_func("[method]calc-session.push-op")
    get_current = ctx.get_func("[method]calc-session.get-current")
    get_history = ctx.get_func("[method]calc-session.get-history")
    reset = ctx.get_func("[method]calc-session.reset")
    assert all((push_op, get_current, get_history, reset))

    session = ctor(ctx.store)
    ctor.post_return(ctx.store)

    push_op(ctx.store, session, "add", 10)
    push_op.post_return(ctx.store)
    current = get_current(ctx.store, session)
    get_current.post_return(ctx.store)
    assert current == 10

    push_op(ctx.store, session, "mul", 3)
    push_op.post_return(ctx.store)
    current = get_current(ctx.store, session)
    get_current.post_return(ctx.store)
    assert current == 30

    push_op(ctx.store, session, "sub", 5)
    push_op.post_return(ctx.store)
    current = get_current(ctx.store, session)
    get_current.post_return(ctx.store)
    assert current == 25

    history = get_history(ctx.store, session)
    get_history.post_return(ctx.store)
    assert len(history) == 3
    assert history[0].op == "add" and history[0].x == 0 and history[0].y == 10 and history[0].value == 10
    assert history[1].op == "mul" and history[1].x == 10 and history[1].y == 3 and history[1].value == 30
    assert history[2].op == "sub" and history[2].x == 30 and history[2].y == 5 and history[2].value == 25

    reset(ctx.store, session)
    reset.post_return(ctx.store)
    current = get_current(ctx.store, session)
    get_current.post_return(ctx.store)
    assert current == 0
