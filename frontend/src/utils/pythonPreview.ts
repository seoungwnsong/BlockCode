import type { Block, Expression, LiteralExpression, UserFunction } from "../types/blocks";
import { isAtomicExpression, isExpressionStatementBlock } from "./blockTree";

export function pyLiteral(expression: LiteralExpression): string {
  if (expression.dataType === "string") return JSON.stringify(String(expression.value));
  if (expression.dataType === "bool") return expression.value ? "True" : "False";

  if (expression.dataType === "float") {
    const value = Number(expression.value);
    return Number.isInteger(value) ? `${value}.0` : String(value);
  }

  return String(expression.value);
}

export function pyExpression(expression: Expression): string {
  switch (expression.type) {
    case "literal":
      return pyLiteral(expression);

    case "variableReference":
      return expression.name || "_";

    case "calculation":
      return `${pyExpression(expression.left)} ${expression.operator} ${pyExpression(expression.right)}`;

    case "calculationChain":
      return [
        pyExpression(expression.first),
        ...expression.operations.map(
          (operation) => `${operation.operator} ${pyExpression(operation.value)}`
        ),
      ].join(" ");

    case "logic":
      return `${pyExpression(expression.left)} ${expression.operator} ${pyExpression(expression.right)}`;

    case "comparisonChain":
      return [
        pyExpression(expression.first),
        ...expression.comparisons.map(
          (comparison) => `${comparison.operator} ${pyExpression(comparison.right)}`
        ),
      ].join(" ");

    case "array":
      return `[${expression.items.map(pyExpression).join(", ")}]`;

    case "set":
      return expression.items.length === 0
        ? "set()"
        : `{${expression.items.map(pyExpression).join(", ")}}`;

    case "tuple":
      // A single-element tuple needs its trailing comma — (1,) is a tuple,
      // (1) is just a parenthesized value. Every other size reads normally.
      return expression.items.length === 1
        ? `(${pyExpression(expression.items[0])},)`
        : `(${expression.items.map(pyExpression).join(", ")})`;

    case "dictionary":
      return `{${expression.entries
        .map((entry) => `${pyExpression(entry.key)}: ${pyExpression(entry.value)}`)
        .join(", ")}}`;

    case "index":
      return `${pyExpression(expression.target)}[${pyExpression(expression.index)}]`;

    case "slice": {
      const start = expression.start === null ? "" : pyExpression(expression.start);
      const stop = expression.stop === null ? "" : pyExpression(expression.stop);
      const bounds = expression.step === null
        ? `${start}:${stop}`
        : `${start}:${stop}:${pyExpression(expression.step)}`;
      return `${pyExpression(expression.target)}[${bounds}]`;
    }

    case "builtinCall": {
      const dotIndex = expression.name.indexOf(".");

      if (dotIndex === -1) {
        return `${expression.name}(${expression.args.map(pyExpression).join(", ")})`;
      }

      const methodName = expression.name.slice(dotIndex + 1);
      const [receiver, ...rest] = expression.args;
      const receiverText = receiver ? pyExpression(receiver) : "";

      return `${receiverText}.${methodName}(${rest.map(pyExpression).join(", ")})`;
    }

    case "call":
      return `${expression.name}(${expression.args.map(pyExpression).join(", ")})`;
  }
}

export function pyCondition(condition: Expression): string {
  if (isAtomicExpression(condition)) return condition.source.trim() || "True";
  return pyExpression(condition);
}

export function pyBlockList(blockList: Block[], indent: number): string[] {
  if (blockList.length === 0) return [`${"    ".repeat(indent)}pass`];
  return blockList.flatMap((block) => pyBlock(block, indent));
}

export function pyBlock(block: Block, indent: number): string[] {
  const pad = "    ".repeat(indent);

  if (isExpressionStatementBlock(block)) {
    return [`${pad}${pyExpression(block)}`];
  }

  switch (block.type) {
    case "variable":
      return [`${pad}${block.name} = ${pyExpression(block.value)}`];

    case "parallelAssign":
      return [
        `${pad}${block.targets.join(", ")} = ${block.values.map(pyExpression).join(", ")}`,
      ];

    case "print":
      return [`${pad}print(${pyExpression(block.value)})`];

    case "return":
      return [`${pad}return ${pyExpression(block.value)}`];

    case "if": {
      const lines = [`${pad}if ${pyCondition(block.condition)}:`, ...pyBlockList(block.children, indent + 1)];

      for (const branch of block.elifBranches) {
        lines.push(`${pad}elif ${pyCondition(branch.condition)}:`);
        lines.push(...pyBlockList(branch.children, indent + 1));
      }

      if (block.elseChildren !== null) {
        lines.push(`${pad}else:`);
        lines.push(...pyBlockList(block.elseChildren, indent + 1));
      }

      return lines;
    }

    case "while":
      return [`${pad}while ${pyCondition(block.condition)}:`, ...pyBlockList(block.children, indent + 1)];

    case "for":
      return [
        `${pad}for ${block.variable} in range(${pyExpression(block.start)}, ${pyExpression(block.end)}):`,
        ...pyBlockList(block.children, indent + 1),
      ];

    case "tryCatch":
      return [
        `${pad}try:`,
        ...pyBlockList(block.tryChildren, indent + 1),
        ...block.catches.flatMap((branch) => [
          `${pad}except ${branch.errorType}:`,
          ...pyBlockList(branch.children, indent + 1),
        ]),
      ];
  }
}

export function buildPythonSource(functions: UserFunction[], mainBlocks: Block[]) {
  const sections: string[] = [];

  for (const func of functions) {
    sections.push(
      [`def ${func.name}(${func.params.join(", ")}):`, ...pyBlockList(func.children, 1)].join("\n")
    );
  }

  if (mainBlocks.length > 0 || functions.length === 0) {
    sections.push(pyBlockList(mainBlocks, 0).join("\n"));
  }

  return sections.join("\n\n");
}
