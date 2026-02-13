//go:generate go tool wit-bindgen-go generate --world adder --out gen ./docs:adder@0.1.0.wasm

package main

import (
	"components-adder-go/gen/docs/adder/add"
)

func init() {
	add.Exports.Add = func(x uint32, y uint32) uint32 {
		return x + y
	}
}

func main() {}
