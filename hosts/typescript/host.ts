/**
 * TypeScript host for WASM calculator components.
 *
 * Uses jco-transpiled components as ES module imports.
 *
 * Usage:
 *   npm run start:go   # Run with Go-built component
 *   npm run start:js   # Run with JS-built component
 */

// import Calc from "./transpiled-js/interfaces/docs-calculator-calculate";

async function main() {
  const variant = process.argv[2] || "go";

  // Define the expected shape of the transpiled component
  // Note: These types would normally come from the generated .d.ts files
  type CalcOp = "add" | "sub" | "mul";

  let calculate: any;

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

  // ──────────────────────────────────────
  // 1. Test eval-expression (string return)
  // ──────────────────────────────────────
  console.log("=== eval-expression (string return) ===");
  console.log(`  add(1,2) = ${calculate.evalExpression("add", 1, 2)}`);
  console.log(`  sub(10,3) = ${calculate.evalExpression("sub", 10, 3)}`);
  console.log(`  mul(4,5) = ${calculate.evalExpression("mul", 4, 5)}`);

  // ──────────────────────────────────────
  // 2. Test eval-expression-detailed (record return)
  // ──────────────────────────────────────
  if (calculate.evalExpressionDetailed) {
    console.log("\n=== eval-expression-detailed (record return) ===");
    const detailed1 = calculate.evalExpressionDetailed("add", 3, 7);
    console.log(`  add(3,7):`, detailed1);
    const detailed2 = calculate.evalExpressionDetailed("mul", 6, 7);
    console.log(`  mul(6,7):`, detailed2);
  }

  // ──────────────────────────────────────
  // 3. Test calc-session resource
  // ──────────────────────────────────────
  if (calculate.CalcSession) {
    console.log("\n=== calc-session resource ===");
    const session = new calculate.CalcSession();
    session.pushOp("add", 10);
    session.pushOp("mul", 3);
    session.pushOp("sub", 5);
    console.log(`  current: ${session.getCurrent()}`);
    console.log(`  history:`, session.getHistory());
    session.reset();
    console.log(`  after reset: ${session.getCurrent()}`);
  }

  // ──────────────────────────────────────
  // 4. Test number-stream resource
  // ──────────────────────────────────────
  if (calculate.NumberStream) {
    console.log("\n=== number-stream resource (pull-based streaming) ===");
    const stream = new calculate.NumberStream();
    stream.startFibonacci();
    console.log(`  fib batch 1:`, stream.read(5));
    console.log(`  fib batch 2:`, stream.read(5));
    stream.stop();
    stream.startSquares();
    console.log(`  squares:`, stream.read(5));
    stream.stop();
  }

  // ──────────────────────────────────────
  // 5. Note about push-based streaming
  // ──────────────────────────────────────
  console.log(
    "\nNote: Push-based streaming (generate-*) requires stream-sink callback setup",
  );
  console.log("      This will be implemented after successful build");

  // ──────────────────────────────────────
  // 6. Test generate-* functions (push-based)
  // ──────────────────────────────────────
  if (calculate.generateFibonacci) {
    console.log(
      "\n=== generate-* functions (will test after callback setup) ===",
    );
    // These require stream-sink to be populated first
    // calculate.generateFibonacci(10);
    // calculate.generateSquares(5);
    // calculate.generatePrimes(8);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
