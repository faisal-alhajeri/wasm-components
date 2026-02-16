//go:generate go tool wit-bindgen-go generate --world calc --out gen calculator-pkg.wasm

package main

import (
	"fmt"

	"components-calculator-go/gen/docs/adder/add"
	"components-calculator-go/gen/docs/calculator/calculate"
	"components-calculator-go/gen/docs/calculator/stream-sink"
	"go.bytecodealliance.org/cm"
)

func init() {
	calculate.Exports.EvalExpression = func(op calculate.Op, x uint32, y uint32) string {
		switch op {
		case calculate.OpAdd:
			result := add.Add(x, y)
			return fmt.Sprintf("the operation of %d add %d = %d", x, y, result)
		case calculate.OpSub:
			result := add.Sub(x, y)
			return fmt.Sprintf("the operation of %d sub %d = %d", x, y, result)
		case calculate.OpMul:
			result := add.Mul(x, y)
			return fmt.Sprintf("the operation of %d mul %d = %d", x, y, result)
		default:
			return "unknown operation"
		}
	}

	calculate.Exports.EvalExpressionDetailed = func(op calculate.Op, x uint32, y uint32) calculate.CalcResult {
		var result uint32
		var opStr string
		switch op {
		case calculate.OpAdd:
			result = add.Add(x, y)
			opStr = "add"
		case calculate.OpSub:
			result = add.Sub(x, y)
			opStr = "sub"
		case calculate.OpMul:
			result = add.Mul(x, y)
			opStr = "mul"
		}
		return calculate.CalcResult{Value: result, Op: opStr, X: x, Y: y}
	}

	calculate.Exports.GenerateFibonacci = func(maxCount uint32) {
		prev, curr := uint32(0), uint32(1)
		for i := uint32(0); i < maxCount; i++ {
			keepGoing := streamsink.OnNumber(curr)
			if !keepGoing {
				break
			}
			prev, curr = curr, prev+curr
		}
		streamsink.OnDone()
	}

	calculate.Exports.GenerateSquares = func(maxCount uint32) {
		for i := uint32(1); i <= maxCount; i++ {
			keepGoing := streamsink.OnNumber(i * i)
			if !keepGoing {
				break
			}
		}
		streamsink.OnDone()
	}

	calculate.Exports.GeneratePrimes = func(maxCount uint32) {
		n := uint32(2)
		count := uint32(0)
		for count < maxCount {
			if isPrime(n) {
				keepGoing := streamsink.OnNumber(n)
				if !keepGoing {
					break
				}
				count++
			}
			n++
		}
		streamsink.OnDone()
	}

	sessionCounter = uint32(1)
	calculate.Exports.CalcSession.Constructor = func() calculate.CalcSession {
		handle := sessionCounter
		sessionCounter++
		calcSessions[handle] = &calcSessionState{
			current: 0,
			history: nil,
		}
		return cm.Reinterpret[calculate.CalcSession](handle)
	}

	calculate.Exports.CalcSession.GetHistory = func(self cm.Rep) cm.List[calculate.CalcResult] {
		handle := cm.Reinterpret[uint32](self)
		state := calcSessions[handle]
		hist := make([]calculate.CalcResult, len(state.history))
		for i, h := range state.history {
			hist[i] = h
		}
		return cm.ToList(hist)
	}

	calculate.Exports.CalcSession.GetCurrent = func(self cm.Rep) uint32 {
		handle := cm.Reinterpret[uint32](self)
		return calcSessions[handle].current
	}

	calculate.Exports.CalcSession.PushOp = func(self cm.Rep, op calculate.Op, value uint32) {
		handle := cm.Reinterpret[uint32](self)
		state := calcSessions[handle]
		var result uint32
		switch op {
		case calculate.OpAdd:
			result = add.Add(state.current, value)
		case calculate.OpSub:
			result = add.Sub(state.current, value)
		case calculate.OpMul:
			result = add.Mul(state.current, value)
		}
		state.history = append(state.history, calculate.CalcResult{
			Value: result,
			Op:    op.String(),
			X:     state.current,
			Y:     value,
		})
		state.current = result
	}

	calculate.Exports.CalcSession.Reset = func(self cm.Rep) {
		handle := cm.Reinterpret[uint32](self)
		state := calcSessions[handle]
		state.current = 0
		state.history = nil
	}

	calculate.Exports.CalcSession.Destructor = func(self cm.Rep) {
		handle := cm.Reinterpret[uint32](self)
		delete(calcSessions, handle)
	}

	streamCounter = uint32(1)
	calculate.Exports.NumberStream.ExportConstructor = func() calculate.NumberStream {
		handle := streamCounter
		streamCounter++
		streams[handle] = &streamState{}
		return cm.Reinterpret[calculate.NumberStream](handle)
	}

	calculate.Exports.NumberStream.StartFibonacci = func(self cm.Rep) {
		handle := cm.Reinterpret[uint32](self)
		streams[handle].kind = "fibonacci"
		streams[handle].fibPrev = 0
		streams[handle].fibCurr = 1
		streams[handle].index = 0
	}

	calculate.Exports.NumberStream.StartSquares = func(self cm.Rep) {
		handle := cm.Reinterpret[uint32](self)
		streams[handle].kind = "squares"
		streams[handle].index = 1
	}

	calculate.Exports.NumberStream.StartPrimes = func(self cm.Rep) {
		handle := cm.Reinterpret[uint32](self)
		streams[handle].kind = "primes"
		streams[handle].nextPrime = 2
		streams[handle].index = 0
	}

	calculate.Exports.NumberStream.Read = func(self cm.Rep, count uint32) cm.List[uint32] {
		handle := cm.Reinterpret[uint32](self)
		st := streams[handle]
		results := make([]uint32, 0, count)
		for i := uint32(0); i < count; i++ {
			switch st.kind {
			case "fibonacci":
				results = append(results, st.fibCurr)
				next := st.fibPrev + st.fibCurr
				st.fibPrev = st.fibCurr
				st.fibCurr = next
			case "squares":
				results = append(results, st.index*st.index)
				st.index++
			case "primes":
				p := nextPrime(st.nextPrime)
				results = append(results, p)
				st.nextPrime = p + 1
				st.index++
			}
		}
		return cm.ToList(results)
	}

	calculate.Exports.NumberStream.Stop = func(self cm.Rep) {
		handle := cm.Reinterpret[uint32](self)
		streams[handle].kind = ""
	}

	calculate.Exports.NumberStream.Destructor = func(self cm.Rep) {
		handle := cm.Reinterpret[uint32](self)
		delete(streams, handle)
	}
}

func main() {}

func isPrime(n uint32) bool {
	if n < 2 {
		return false
	}
	for i := uint32(2); i*i <= n; i++ {
		if n%i == 0 {
			return false
		}
	}
	return true
}

func nextPrime(start uint32) uint32 {
	n := start
	for !isPrime(n) {
		n++
	}
	return n
}

type calcSessionState struct {
	current uint32
	history []calculate.CalcResult
}

var calcSessions = make(map[uint32]*calcSessionState)
var sessionCounter uint32

type streamState struct {
	kind      string
	index     uint32
	fibPrev   uint32
	fibCurr   uint32
	nextPrime uint32
}

var streams = make(map[uint32]*streamState)
var streamCounter uint32
