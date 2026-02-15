# WASM Component Model - Build Orchestration
#
# Prerequisites:
#   - tinygo (>= 0.33)
#   - wasm-tools
#   - jco + @bytecodealliance/componentize-js (npm -g)
#   - uv (Python package manager)
#   - node (>= 22)

.PHONY: all clean plugins-go plugins-js compose hosts-transpile \
        run-python-go run-python-js run-ts-go run-ts-js run-all

BUILD_DIR := build

# ─── Go Plugins (TinyGo → wasm-unknown → wasm-tools component) ───────────────

GO_ADDER_DIR     := plugins/go/adder
GO_CALC_DIR      := plugins/go/calculator

$(BUILD_DIR)/go-adder.wasm: $(GO_ADDER_DIR)/main.go wit/adder/world.wit
	@echo "==> Building Go adder plugin"
	cd $(GO_ADDER_DIR) && tinygo build -target=wasm-unknown -o adder-core.wasm .
	cd $(GO_ADDER_DIR) && wasm-tools component embed --world adder ../../../wit/adder adder-core.wasm -o adder-embedded.wasm
	cd $(GO_ADDER_DIR) && wasm-tools component new adder-embedded.wasm -o adder.wasm
	cp $(GO_ADDER_DIR)/adder.wasm $@
	rm -f $(GO_ADDER_DIR)/adder-core.wasm $(GO_ADDER_DIR)/adder-embedded.wasm $(GO_ADDER_DIR)/adder.wasm

$(BUILD_DIR)/go-calculator.wasm: $(GO_CALC_DIR)/main.go wit/calculator/world.wit
	@echo "==> Building Go calculator plugin"
	cd $(GO_CALC_DIR) && tinygo build -target=wasm-unknown -o calculator-core.wasm .
	cd $(GO_CALC_DIR) && wasm-tools component embed --world calculator ../../../wit/calculator calculator-core.wasm -o calculator-embedded.wasm
	cd $(GO_CALC_DIR) && wasm-tools component new calculator-embedded.wasm -o calculator.wasm
	cp $(GO_CALC_DIR)/calculator.wasm $@
	rm -f $(GO_CALC_DIR)/calculator-core.wasm $(GO_CALC_DIR)/calculator-embedded.wasm $(GO_CALC_DIR)/calculator.wasm

plugins-go: $(BUILD_DIR)/go-adder.wasm $(BUILD_DIR)/go-calculator.wasm

# ─── JS Plugins (jco componentize) ────────────────────────────────────────────

JS_ADDER_DIR     := plugins/js/adder
JS_CALC_DIR      := plugins/js/calculator

$(BUILD_DIR)/js-adder.wasm: $(JS_ADDER_DIR)/adder.js wit/adder/world.wit
	@echo "==> Building JS adder plugin"
	jco componentize $(JS_ADDER_DIR)/adder.js \
		--wit wit/adder/world.wit \
		--world-name adder \
		--out $@ \
		--disable all

$(BUILD_DIR)/js-calculator.wasm: $(JS_CALC_DIR)/calculator.js wit/calculator/world.wit
	@echo "==> Building JS calculator plugin"
	jco componentize $(JS_CALC_DIR)/calculator.js \
		--wit wit/calculator \
		--world-name calculator \
		--out $@ \
		--disable all

plugins-js: $(BUILD_DIR)/js-adder.wasm $(BUILD_DIR)/js-calculator.wasm

# ─── Compose (wasm-tools compose: calculator + adder → composed) ──────────────

$(BUILD_DIR)/composed-go.wasm: $(BUILD_DIR)/go-calculator.wasm $(BUILD_DIR)/go-adder.wasm
	@echo "==> Composing Go calculator + adder"
	wasm-tools compose $(BUILD_DIR)/go-calculator.wasm \
		-d $(BUILD_DIR)/go-adder.wasm \
		-o $@

$(BUILD_DIR)/composed-js.wasm: $(BUILD_DIR)/js-calculator.wasm $(BUILD_DIR)/js-adder.wasm
	@echo "==> Composing JS calculator + adder"
	wasm-tools compose $(BUILD_DIR)/js-calculator.wasm \
		-d $(BUILD_DIR)/js-adder.wasm \
		-o $@

compose: $(BUILD_DIR)/composed-go.wasm $(BUILD_DIR)/composed-js.wasm

# ─── Hosts ────────────────────────────────────────────────────────────────────

TS_HOST_DIR := hosts/typescript

hosts-transpile: $(BUILD_DIR)/composed-go.wasm $(BUILD_DIR)/composed-js.wasm
	@echo "==> Transpiling components for TypeScript host"
	jco transpile $(BUILD_DIR)/composed-go.wasm -o $(TS_HOST_DIR)/transpiled-go --name composed-go
	jco transpile $(BUILD_DIR)/composed-js.wasm -o $(TS_HOST_DIR)/transpiled-js --name composed-js

# ─── Run targets ──────────────────────────────────────────────────────────────

run-python-go: $(BUILD_DIR)/composed-go.wasm
	@echo "==> Running Python host with Go component"
	cd hosts/python && uv run python3 host.py ../../$(BUILD_DIR)/composed-go.wasm

run-python-js: $(BUILD_DIR)/composed-js.wasm
	@echo "==> Running Python host with JS component"
	cd hosts/python && uv run python3 host.py ../../$(BUILD_DIR)/composed-js.wasm

run-ts-go: hosts-transpile
	@echo "==> Running TypeScript host with Go component"
	cd $(TS_HOST_DIR) && node --experimental-wasm-type-reflection host.ts go

run-ts-js: hosts-transpile
	@echo "==> Running TypeScript host with JS component"
	cd $(TS_HOST_DIR) && node --experimental-wasm-type-reflection host.ts js

run-all: run-python-go run-python-js run-ts-go run-ts-js

# ─── Top-level targets ────────────────────────────────────────────────────────

all: plugins-go plugins-js compose hosts-transpile
	@echo "==> Build complete. Run 'make run-all' to test all hosts."

clean:
	rm -rf $(BUILD_DIR)/*.wasm
	rm -rf $(TS_HOST_DIR)/transpiled-go $(TS_HOST_DIR)/transpiled-js
	rm -f $(GO_ADDER_DIR)/adder-core.wasm $(GO_ADDER_DIR)/adder-embedded.wasm $(GO_ADDER_DIR)/adder.wasm
	rm -f $(GO_CALC_DIR)/calculator-core.wasm $(GO_CALC_DIR)/calculator-embedded.wasm $(GO_CALC_DIR)/calculator.wasm
	@echo "==> Cleaned build artifacts"
