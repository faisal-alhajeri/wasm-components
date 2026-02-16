//go:generate go tool wit-bindgen-go generate --world adder --out gen adder-pkg.wasm

package main

import (
	"components-adder-go/gen/docs/adder/add"
)

func init() {
	add.Exports.Add = func(x uint32, y uint32) uint32 {
		return x + y
	}
	add.Exports.Sub = func(x uint32, y uint32) uint32 {
		return x - y
	}
	add.Exports.Mul = func(x uint32, y uint32) uint32 {
		return x * y
	}
}

func main() {}
