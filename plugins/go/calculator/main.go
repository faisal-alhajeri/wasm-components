//go:generate go tool wit-bindgen-go generate --world calculator --out gen ./wit

package main

import (
	"fmt"

	"components-calculator-go/gen/docs/adder/add"
	"components-calculator-go/gen/docs/calculator/calculate"
)

func init() {
	calculate.Exports.EvalExpression = func(op calculate.Op, x uint32, y uint32) string {
		switch op {
		case calculate.OpAdd:
			result := add.Add(x, y)
			return fmt.Sprintf("the operation of %d add %d = %d", x, y, result)
		default:
			return "unknown operation"
		}
	}
}

func main() {}
