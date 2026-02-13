/**
 * TypeScript host for WASM calculator components (reactor mode).
 *
 * Uses jco-transpiled components as ES module imports.
 * The composed component exports docs:calculator/calculate@0.1.0
 * which provides evalExpression(op, x, y) -> string.
 *
 * Usage:
 *   npm run start:go   # Run with Go-built component
 *   npm run start:js   # Run with JS-built component
 */

async function main() {
  const variant = process.argv[2] || "go";

  let calculate: {
    evalExpression(op: "add", x: number, y: number): string;
  };

  if (variant === "go") {
    const mod = await import("./transpiled-go/composed-go.js");
    calculate = mod.calculate;
  } else if (variant === "js") {
    const mod = await import("./transpiled-js/composed-js.js");
    calculate = mod.calculate;
  } else {
    console.error(`Unknown variant: ${variant}. Use "go" or "js".`);
    process.exit(1);
  }

  // Call eval-expression (reactor mode: just call the export, no _start)
  const result1 = calculate.evalExpression("add", 1, 2);
  console.log(`Result: ${result1}`);

  const result2 = calculate.evalExpression("add", 100, 200);
  console.log(`Result: ${result2}`);

  const result3 = calculate.evalExpression("add", 0, 0);
  console.log(`Result: ${result3}`);
}

main();
