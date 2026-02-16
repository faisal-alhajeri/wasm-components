from conftest import WasmCtx


def test_number_stream(wasm_component: WasmCtx) -> None:
    ctx = wasm_component
    ctor = ctx.get_func("[constructor]number-stream")
    assert ctor is not None
    start_fib = ctx.get_func("[method]number-stream.start-fibonacci")
    start_squares = ctx.get_func("[method]number-stream.start-squares")
    start_primes = ctx.get_func("[method]number-stream.start-primes")
    read = ctx.get_func("[method]number-stream.read")
    stop = ctx.get_func("[method]number-stream.stop")
    assert start_fib is not None
    assert start_squares is not None
    assert start_primes is not None
    assert read is not None
    assert stop is not None

    stream = ctor(ctx.store)
    ctor.post_return(ctx.store)

    start_fib(ctx.store, stream)
    start_fib.post_return(ctx.store)
    batch1 = read(ctx.store, stream, 5)
    read.post_return(ctx.store)
    assert list(batch1) == [1, 1, 2, 3, 5]
    batch2 = read(ctx.store, stream, 5)
    read.post_return(ctx.store)
    assert list(batch2) == [8, 13, 21, 34, 55]
    stop(ctx.store, stream)
    stop.post_return(ctx.store)

    start_squares(ctx.store, stream)
    start_squares.post_return(ctx.store)
    squares = read(ctx.store, stream, 5)
    read.post_return(ctx.store)
    assert list(squares) == [1, 4, 9, 16, 25]
    stop(ctx.store, stream)
    stop.post_return(ctx.store)

    start_primes(ctx.store, stream)
    start_primes.post_return(ctx.store)
    primes = read(ctx.store, stream, 5)
    read.post_return(ctx.store)
    assert list(primes) == [2, 3, 5, 7, 11]
    stop(ctx.store, stream)
    stop.post_return(ctx.store)
