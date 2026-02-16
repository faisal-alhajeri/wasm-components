import * as fs from "fs";
import * as path from "path";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const cache = new Map<
  string,
  { calculate: any; collectedNumbers: number[] }
>();

export async function getCalculate(
  variant: "go" | "js"
): Promise<{ calculate: any; collectedNumbers: number[] }> {
  const cached = cache.get(variant);
  if (cached) return cached;

  const transpiledDir =
    variant === "go" ? "./transpiled/go" : "./transpiled/js";
  const modPath = `${transpiledDir}/composed-${variant}.js`;

  const { instantiate } = (await import(modPath)) as any;
  const moduleCache = new Map<string, WebAssembly.Module>();
  const collectedNumbers: number[] = [];

  function getCoreModule(modulePath: string): WebAssembly.Module {
    if (moduleCache.has(modulePath)) return moduleCache.get(modulePath)!;
    const fullPath = path.join(process.cwd(), transpiledDir, modulePath);
    const wasmBuffer = fs.readFileSync(fullPath);
    const module = new WebAssembly.Module(wasmBuffer);
    moduleCache.set(modulePath, module);
    return module;
  }

  const streamSinkImpl = {
    onNumber(value: number): boolean {
      collectedNumbers.push(value);
      return true;
    },
    onDone(): void {},
  };

  const imports = {
    ...new WASIShim().getImportObject(),
    "docs:calculator/stream-sink": streamSinkImpl,
  };

  const root = instantiate(getCoreModule, imports);
  if (!root.calculate) throw new Error("calculate exports not found");

  const result = { calculate: root.calculate, collectedNumbers };
  cache.set(variant, result);
  return result;
}
