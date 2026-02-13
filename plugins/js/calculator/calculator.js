import { add } from "docs:adder/add@0.1.0";

export const calculate = {
  evalExpression(op, x, y) {
    switch (op) {
      case "add": {
        const result = add(x, y);
        return `the operation of ${x} add ${y} = ${result}`;
      }
      default:
        return "unknown operation";
    }
  },
};
