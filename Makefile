# WASM Component Model - Build Orchestration
#
# Prerequisites:
#   - tinygo (>= 0.33)
#   - wasm-tools (for component new/embed)
#   - wac-cli (for component composition)
#   - jco + @bytecodealliance/componentize-js (npm -g)
#   - uv (Python package manager)
#   - node (>= 22)
#   - wkg (wasm package tool)
#   - componentize-py (pip/uv)

.PHONY: all clean plugins-go plugins-js plugins-py types-py compose hosts-transpile \
        run-python run-ts run-all check-types

BUILD_DIR := build

# ─── Go Plugins (TinyGo → component) ─────────────────────────────────────────

GO_ADDER_DIR     := plugins/go/adder
GO_CALC_DIR      := plugins/go/calculator

$(BUILD_DIR): 
	mkdir -p $@

# Go adder: wasm-unknown target (no WASI imports needed)
$(BUILD_DIR)/go-adder.wasm: $(GO_ADDER_DIR)/main.go $(GO_ADDER_DIR)/wit/component.wit wit/adder/world.wit $(BUILD_DIR)
	@echo "==> Building Go adder plugin"
	cd $(GO_ADDER_DIR) && wkg wit fetch 
	cd $(GO_ADDER_DIR) && wkg wit build 
	cd $(GO_ADDER_DIR) && go tool wit-bindgen-go generate --world adder --out gen  go-pl:test@1.0.0.wasm
	cd $(GO_ADDER_DIR) && tinygo build -target=wasm-unknown -o adder-core.wasm .
	cd $(GO_ADDER_DIR) && wasm-tools component embed  wit --world adder adder-core.wasm -o adder-embedded.wasm
	cd $(GO_ADDER_DIR) && wasm-tools component new adder-embedded.wasm -o adder.wasm
	cp $(GO_ADDER_DIR)/adder.wasm $@
	rm -f $(GO_ADDER_DIR)/adder-core.wasm $(GO_ADDER_DIR)/adder-embedded.wasm $(GO_ADDER_DIR)/adder.wasm

# Go calculator: imports custom interface, needs manual embed+new pipeline
$(BUILD_DIR)/go-calculator.wasm: $(GO_CALC_DIR)/main.go $(GO_CALC_DIR)/wit/component.wit wit/calculator/world.wit $(BUILD_DIR)
	@echo "==> Building Go calculator plugin"
	cd $(GO_CALC_DIR) && wkg wit fetch 
	cd $(GO_CALC_DIR) && wkg wit build 
	cd $(GO_CALC_DIR) && go tool wit-bindgen-go generate --world calc --out gen  go-pl:test@1.0.0.wasm
	cd $(GO_CALC_DIR) && tinygo build -target=wasm-unknown -o calculator-core.wasm .
	cd $(GO_CALC_DIR) && wasm-tools component embed wit --world calc  calculator-core.wasm -o calculator-embedded.wasm
	cd $(GO_CALC_DIR) && wasm-tools component new calculator-embedded.wasm -o calculator.wasm
	cp $(GO_CALC_DIR)/calculator.wasm $@
	rm -f $(GO_CALC_DIR)/calculator-core.wasm $(GO_CALC_DIR)/calculator-embedded.wasm $(GO_CALC_DIR)/calculator.wasm

# ─── JS Plugins (jco componentize) ────────────────────────────────────────────

JS_ADDER_DIR     := plugins/js/adder
JS_CALC_DIR      := plugins/js/calculator

$(BUILD_DIR)/js-adder.wasm: $(JS_ADDER_DIR)/adder.ts wit/adder/world.wit $(BUILD_DIR)
	@echo "==> Building JS adder plugin"
	cd $(JS_ADDER_DIR) && npx tsc && jco componentize dist/adder.js \
		--wit wit \
		--world-name adder \
		--out ../../../$@ \
		--disable all

$(BUILD_DIR)/js-calculator.wasm: $(JS_CALC_DIR)/calculator.ts wit/calculator/world.wit $(BUILD_DIR)
	@echo "==> Building JS calculator plugin"
	cd $(JS_CALC_DIR) && jco types wit --world-name calc -o types && npx tsc && jco componentize dist/calculator.js \
		--wit wit \
		--world-name calc \
		--out ../../../$@ \
		--disable all

plugins-go: $(BUILD_DIR)/go-adder.wasm $(BUILD_DIR)/go-calculator.wasm 

plugins-js: $(BUILD_DIR)/js-adder.wasm $(BUILD_DIR)/js-calculator.wasm 

# ─── Python Plugins (componentize-py) ─────────────────────────────────────────

PY_ADDER_DIR     := plugins/python/adder
PY_CALC_DIR      := plugins/python/calculator
HOSTS_PY         := hosts/python

types-py: $(PY_ADDER_DIR)/wit/component.wit $(PY_CALC_DIR)/wit/component.wit
	@echo "==> Generating Python bindings (componentize-py bindings)"
	cd $(PY_ADDER_DIR) && wkg wit fetch 
	rm -rf $(PY_ADDER_DIR)/wit_world
	cd $(HOSTS_PY) && uv run componentize-py -d ../../$(PY_ADDER_DIR)/wit -w adder bindings ../../$(PY_ADDER_DIR)
	cd $(PY_CALC_DIR) && wkg wit fetch
	rm -rf $(PY_CALC_DIR)/wit_calc $(PY_CALC_DIR)/componentize_py_types.py $(PY_CALC_DIR)/componentize_py_async_support $(PY_CALC_DIR)/componentize_py_runtime.pyi $(PY_CALC_DIR)/poll_loop.py
	cd $(HOSTS_PY) && uv run componentize-py -d ../../$(PY_CALC_DIR)/wit -w calc --world-module wit_calc bindings ../../$(PY_CALC_DIR)

$(BUILD_DIR)/py-adder.wasm: $(PY_ADDER_DIR)/app.py $(PY_ADDER_DIR)/wit/component.wit wit/adder/world.wit $(BUILD_DIR)
	@echo "==> Building Python adder plugin"
	cd $(PY_ADDER_DIR) && wkg wit fetch 
	cd $(HOSTS_PY) && uv run componentize-py -d ../../$(PY_ADDER_DIR)/wit -w adder componentize --stub-wasi -p ../../$(PY_ADDER_DIR) app -o ../../$@

$(BUILD_DIR)/py-calculator.wasm: $(PY_CALC_DIR)/calculate.py $(PY_CALC_DIR)/wit/component.wit wit/calculator/world.wit types-py $(BUILD_DIR)
	@echo "==> Building Python calculator plugin"
	cd $(HOSTS_PY) && uv run componentize-py -d ../../$(PY_CALC_DIR)/wit -w calc --world-module wit_calc componentize --stub-wasi -p ../../$(PY_CALC_DIR) calculate -o ../../$@

plugins-py: $(BUILD_DIR)/py-adder.wasm $(BUILD_DIR)/py-calculator.wasm

# ─── Compose (wac plug: calculator + adder → composed) ──────────────

$(BUILD_DIR)/composed-go.wasm: $(BUILD_DIR)/go-calculator.wasm $(BUILD_DIR)/go-adder.wasm
	@echo "==> Composing Go calculator + adder"
	wac plug $(BUILD_DIR)/go-calculator.wasm \
		--plug $(BUILD_DIR)/go-adder.wasm \
		-o $@

$(BUILD_DIR)/composed-js.wasm: $(BUILD_DIR)/js-calculator.wasm $(BUILD_DIR)/js-adder.wasm
	@echo "==> Composing JS calculator + adder"
	wac plug $(BUILD_DIR)/js-calculator.wasm \
		--plug $(BUILD_DIR)/js-adder.wasm \
		-o $@

$(BUILD_DIR)/composed-py.wasm: $(BUILD_DIR)/py-calculator.wasm $(BUILD_DIR)/py-adder.wasm
	@echo "==> Composing Python calculator + adder"
	wac plug $(BUILD_DIR)/py-calculator.wasm \
		--plug $(BUILD_DIR)/py-adder.wasm \
		-o $@

compose: $(BUILD_DIR)/composed-go.wasm $(BUILD_DIR)/composed-js.wasm $(BUILD_DIR)/composed-py.wasm

# ─── Hosts ────────────────────────────────────────────────────────────────────

TS_HOST_DIR := hosts/typescript

hosts-transpile: $(BUILD_DIR)/composed-go.wasm $(BUILD_DIR)/composed-js.wasm $(BUILD_DIR)/composed-py.wasm
	@echo "==> Transpiling components for TypeScript host"
	jco transpile $(BUILD_DIR)/composed-go.wasm -o $(TS_HOST_DIR)/transpiled/go --name composed-go --instantiation sync
	jco transpile $(BUILD_DIR)/composed-js.wasm -o $(TS_HOST_DIR)/transpiled/js --name composed-js --instantiation sync
	jco transpile $(BUILD_DIR)/composed-py.wasm -o $(TS_HOST_DIR)/transpiled/py --name composed-py --instantiation sync

# ─── Run targets ──────────────────────────────────────────────────────────────

run-python: $(BUILD_DIR)/composed-go.wasm $(BUILD_DIR)/composed-js.wasm $(BUILD_DIR)/composed-py.wasm
	@echo "==> Running Python tests"
	cd hosts/python && uv run pytest -v

run-ts: hosts-transpile
	@echo "==> Running TypeScript tests"
	cd $(TS_HOST_DIR) && node --experimental-wasm-type-reflection --import tsx --test '*.test.ts'

run-all: run-python run-ts

check-types:
	cd hosts/python && uv run pyright

# ─── Top-level targets ────────────────────────────────────────────────────────

all: plugins-go plugins-js plugins-py compose hosts-transpile
	@echo "==> Build complete. Run 'make run-all' to test all hosts."

clean:
	rm -rf $(BUILD_DIR)/*.wasm
	rm -rf $(TS_HOST_DIR)/transpiled/go $(TS_HOST_DIR)/transpiled/js $(TS_HOST_DIR)/transpiled/py
	rm -rf $(JS_ADDER_DIR)/dist $(JS_CALC_DIR)/dist $(JS_CALC_DIR)/types $(JS_ADDER_DIR)/wit.d.ts
	rm -rf $(PY_CALC_DIR)/wit_world $(PY_CALC_DIR)/wit_calc $(PY_CALC_DIR)/componentize_py_types.py $(PY_CALC_DIR)/componentize_py_async_support $(PY_CALC_DIR)/componentize_py_runtime.pyi $(PY_CALC_DIR)/poll_loop.py
	rm -f $(GO_ADDER_DIR)/adder-core.wasm $(GO_ADDER_DIR)/adder-embedded.wasm $(GO_ADDER_DIR)/adder.wasm
	rm -f $(GO_CALC_DIR)/calculator.wasm
	@echo "==> Cleaned build artifacts"