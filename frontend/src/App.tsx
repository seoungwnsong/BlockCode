import { useState } from "react";
import type { DragEvent } from "react";
import "./App.css";

type DataType = "int" | "float" | "bool" | "string";
type MathOperator = "+" | "-" | "*" | "/" | "%";
type ComparisonOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";
type LogicOperator = ComparisonOperator | "and" | "or";

type LiteralExpression = {
  id: number;
  type: "literal";
  dataType: DataType;
  value: string | number | boolean;
  source: string;
  valid: boolean;
  error?: string;
};

type VariableReferenceExpression = {
  id: number;
  type: "variableReference";
  name: string;
  source: string;
  valid: true;
};

type CalculationExpression = {
  id: number;
  type: "calculation";
  left: Expression;
  operator: MathOperator;
  right: Expression;
};

type CalculationChainExpression = {
  id: number;
  type: "calculationChain";
  first: Expression;
  operations: {
    operator: MathOperator;
    value: Expression;
  }[];
};

type LogicExpression = {
  id: number;
  type: "logic";
  left: Expression;
  operator: LogicOperator;
  right: Expression;
};

type ComparisonChainExpression = {
  id: number;
  type: "comparisonChain";
  first: Expression;
  comparisons: {
    operator: ComparisonOperator;
    right: Expression;
  }[];
};

type ArrayExpression = {
  id: number;
  type: "array";
  items: Expression[];
};

type SetExpression = {
  id: number;
  type: "set";
  items: Expression[];
};

type DictionaryEntry = {
  id: number;
  key: Expression;
  value: Expression;
};

type DictionaryExpression = {
  id: number;
  type: "dictionary";
  entries: DictionaryEntry[];
};


type CallExpression = {
  id: number;
  type: "call";
  functionId: number;
  name: string;
  paramNames: string[];
  args: Expression[];
};

type Expression =
  | LiteralExpression
  | VariableReferenceExpression
  | CalculationExpression
  | CalculationChainExpression
  | LogicExpression
  | ComparisonChainExpression
  | ArrayExpression
  | SetExpression
  | DictionaryExpression
  | CallExpression;

type ExpressionStatementBlock =
  | CalculationExpression
  | CalculationChainExpression
  | LogicExpression
  | ComparisonChainExpression
  | ArrayExpression
  | SetExpression
  | DictionaryExpression
  | CallExpression;

type ElifBranch = {
  id: number;
  condition: Expression;
  children: Block[];
};

type IfBlock = {
  id: number;
  type: "if";
  condition: Expression;
  children: Block[];
  elifBranches: ElifBranch[];
  elseChildren: Block[] | null;
};

type ParallelAssignmentBlock = {
  id: number;
  type: "parallelAssign";
  targets: string[];
  values: Expression[];
};

type Block =
  | {
      id: number;
      type: "variable";
      name: string;
      value: Expression;
    }
  | ParallelAssignmentBlock
  | ExpressionStatementBlock
  | {
      id: number;
      type: "print";
      value: Expression;
    }
  | {
      id: number;
      type: "return";
      value: Expression;
    }
  | IfBlock
  | {
      id: number;
      type: "while";
      condition: Expression;
      children: Block[];
    }
  | {
      id: number;
      type: "for";
      variable: string;
      start: Expression;
      end: Expression;
      children: Block[];
    }
  | {
      id: number;
      type: "tryCatch";
      catchErrorName: string;
      tryChildren: Block[];
      catchChildren: Block[];
    };

type UserFunction = {
  id: number;
  name: string;
  params: string[];
  children: Block[];
};

type BlockType = Block["type"];

type BlockCategory = "basics" | "expressions" | "data" | "flow" | "more";

const BLOCK_CATEGORIES: { id: BlockCategory; label: string; title: string }[] = [
  { id: "basics", label: "Basic", title: "Basic blocks" },
  { id: "expressions", label: "Expr", title: "Expressions" },
  { id: "data", label: "Data", title: "Data structures" },
  { id: "flow", label: "Flow", title: "Control flow" },
  { id: "more", label: "More", title: "More blocks" },
];

type ListDropTarget =
  | {
      area: "root";
      index: number;
    }
  | {
      area: "children";
      parentId: number;
      index: number;
    }
  | {
      area: "elifChildren";
      parentId: number;
      branchId: number;
      index: number;
    }
  | {
      area: "elseChildren";
      parentId: number;
      index: number;
    }
  | {
      area: "tryChildren";
      parentId: number;
      index: number;
    }
  | {
      area: "catchChildren";
      parentId: number;
      index: number;
    };

type ExpressionDropTarget = {
  area: "expression";
  expressionId: number;
};

type DropTarget = ListDropTarget | ExpressionDropTarget;
type ListArea = ListDropTarget["area"];

type JsonExpression =
  | {
      id: number;
      type: "literal";
      dataType: DataType;
      value: string | number | boolean;
    }
  | {
      id: number;
      type: "variableReference";
      name: string;
    }
  | {
      id: number;
      type: "calculation";
      left: JsonExpression;
      operator: MathOperator;
      right: JsonExpression;
    }
  | {
      id: number;
      type: "calculationChain";
      first: JsonExpression;
      operations: {
        operator: MathOperator;
        value: JsonExpression;
      }[];
    }
  | {
      id: number;
      type: "logic";
      left: JsonExpression;
      operator: LogicOperator;
      right: JsonExpression;
    }
  | {
      id: number;
      type: "comparisonChain";
      first: JsonExpression;
      comparisons: {
        operator: ComparisonOperator;
        right: JsonExpression;
      }[];
    }
  | {
      id: number;
      type: "array";
      items: JsonExpression[];
    }
  | {
      id: number;
      type: "set";
      items: JsonExpression[];
    }
  | {
      id: number;
      type: "dictionary";
      entries: {
        id: number;
        key: JsonExpression;
        value: JsonExpression;
      }[];
    }
  | {
      id: number;
      type: "call";
      functionId: number;
      name: string;
      paramNames: string[];
      args: JsonExpression[];
    };

type JsonCondition = string | JsonExpression;

type JsonElifBranch = {
  id: number;
  condition: JsonCondition;
  children: JsonBlock[];
};

type JsonBlock =
  | {
      id: number;
      type: "variable";
      name: string;
      value: JsonExpression;
    }
  | {
      id: number;
      type: "parallelAssign";
      targets: string[];
      values: JsonExpression[];
    }
  | Extract<
      JsonExpression,
      {
        type:
          | "calculation"
          | "calculationChain"
          | "logic"
          | "comparisonChain"
          | "array"
          | "set"
          | "dictionary"
          | "call";
      }
    >
  | {
      id: number;
      type: "print";
      value: JsonExpression;
    }
  | {
      id: number;
      type: "return";
      value: JsonExpression;
    }
  | {
      id: number;
      type: "if";
      condition: JsonCondition;
      children: JsonBlock[];
      elifBranches: JsonElifBranch[];
      elseChildren: JsonBlock[] | null;
    }
  | {
      id: number;
      type: "while";
      condition: JsonCondition;
      children: JsonBlock[];
    }
  | {
      id: number;
      type: "for";
      variable: string;
      start: JsonExpression;
      end: JsonExpression;
      children: JsonBlock[];
    }
  | {
      id: number;
      type: "tryCatch";
      catchErrorName: string;
      tryChildren: JsonBlock[];
      catchChildren: JsonBlock[];
    };

let idCounter = 0;

function makeId() {
  idCounter += 1;
  return Date.now() * 1000 + idCounter;
}

function decodeQuotedString(source: string, quote: "'" | '"') {
  const body = source.slice(1, -1);

  return body.replace(/\\([\\'"nrt])/g, (_, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    if (escaped === quote) return quote;
    return escaped;
  });
}

function createAtomicExpression(source = "", id = makeId()): Expression {
  const trimmed = source.trim();

  if (trimmed === "") {
    return {
      id,
      type: "literal",
      dataType: "string",
      value: "",
      source,
      valid: true,
    };
  }

  const firstCharacter = trimmed[0];

  if (firstCharacter === '"' || firstCharacter === "'") {
    const quote = firstCharacter as "'" | '"';
    const isClosed = trimmed.length >= 2 && trimmed.at(-1) === quote;

    if (isClosed) {
      return {
        id,
        type: "literal",
        dataType: "string",
        value: decodeQuotedString(trimmed, quote),
        source,
        valid: true,
      };
    }

    return {
      id,
      type: "literal",
      dataType: "string",
      value: trimmed.slice(1),
      source,
      valid: false,
      error: `Close the string with ${quote}.`,
    };
  }

  if (/^[+-]?\d+$/.test(trimmed)) {
    return {
      id,
      type: "literal",
      dataType: "int",
      value: Number(trimmed),
      source,
      valid: true,
    };
  }

  if (
    /^[+-]?(?:(?:\d+\.\d*)|(?:\.\d+)|(?:\d+[eE][+-]?\d+)|(?:\d+\.\d*[eE][+-]?\d+)|(?:\.\d+[eE][+-]?\d+))$/.test(
      trimmed
    )
  ) {
    return {
      id,
      type: "literal",
      dataType: "float",
      value: Number(trimmed),
      source,
      valid: true,
    };
  }

  if (trimmed.toLowerCase() === "true" || trimmed.toLowerCase() === "false") {
    return {
      id,
      type: "literal",
      dataType: "bool",
      value: trimmed.toLowerCase() === "true",
      source,
      valid: true,
    };
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return {
      id,
      type: "variableReference",
      name: trimmed,
      source,
      valid: true,
    };
  }

  return {
    id,
    type: "literal",
    dataType: "string",
    value: source,
    source,
    valid: false,
    error: "Strings need matching single or double quotation marks.",
  };
}

function createConditionExpression(
  source = "",
  id = makeId()
): LiteralExpression {
  return {
    id,
    type: "literal",
    dataType: "string",
    value: source,
    source,
    valid: true,
  };
}

function sanitizeIdentifierInput(value: string) {
  return value.replace(/\s+/g, "");
}

function createCalculationExpression(id = makeId()): CalculationExpression {
  return {
    id,
    type: "calculation",
    left: createAtomicExpression(),
    operator: "+",
    right: createAtomicExpression(),
  };
}

function createCalculationChainExpression(
  source?: CalculationExpression,
  id = source?.id ?? makeId()
): CalculationChainExpression {
  return {
    id,
    type: "calculationChain",
    first: source?.left ?? createAtomicExpression(),
    operations: source
      ? [
          { operator: source.operator, value: source.right },
          { operator: source.operator, value: createAtomicExpression() },
        ]
      : [
          { operator: "+", value: createAtomicExpression() },
          { operator: "+", value: createAtomicExpression() },
        ],
  };
}

function createLogicExpression(id = makeId()): LogicExpression {
  return {
    id,
    type: "logic",
    left: createAtomicExpression(),
    operator: "==",
    right: createAtomicExpression(),
  };
}

function createComparisonChainExpression(
  source?: LogicExpression,
  id = source?.id ?? makeId()
): ComparisonChainExpression {
  const operator: ComparisonOperator =
    source && source.operator !== "and" && source.operator !== "or"
      ? source.operator
      : "==";

  return {
    id,
    type: "comparisonChain",
    first: source?.left ?? createAtomicExpression(),
    comparisons: source
      ? [
          { operator, right: source.right },
          { operator, right: createAtomicExpression() },
        ]
      : [
          { operator: "==", right: createAtomicExpression() },
          { operator: "==", right: createAtomicExpression() },
        ],
  };
}

function createArrayExpression(id = makeId()): ArrayExpression {
  return {
    id,
    type: "array",
    items: [createAtomicExpression()],
  };
}

function createSetExpression(id = makeId()): SetExpression {
  return {
    id,
    type: "set",
    items: [createAtomicExpression()],
  };
}

function createDictionaryExpression(id = makeId()): DictionaryExpression {
  return {
    id,
    type: "dictionary",
    entries: [
      {
        id: makeId(),
        key: createAtomicExpression(),
        value: createAtomicExpression(),
      },
    ],
  };
}

function createCallExpression(func: UserFunction): CallExpression {
  return {
    id: makeId(),
    type: "call",
    functionId: func.id,
    name: func.name,
    paramNames: [...func.params],
    args: func.params.map(() => createAtomicExpression()),
  };
}

function createBlock(type: BlockType): Block {
  const id = makeId();

  switch (type) {
    case "variable":
      return {
        id,
        type: "variable",
        name: "",
        value: createAtomicExpression(),
      };

    case "parallelAssign":
      return {
        id,
        type: "parallelAssign",
        targets: ["a", "b"],
        values: [createAtomicExpression(), createAtomicExpression()],
      };

    case "calculation":
      return createCalculationExpression(id);

    case "calculationChain":
      return createCalculationChainExpression(undefined, id);

    case "logic":
      return createLogicExpression(id);

    case "comparisonChain":
      return createComparisonChainExpression(undefined, id);

    case "array":
      return createArrayExpression(id);

    case "set":
      return createSetExpression(id);

    case "dictionary":
      return createDictionaryExpression(id);


    case "print":
      return {
        id,
        type: "print",
        value: createAtomicExpression(),
      };

    case "return":
      return {
        id,
        type: "return",
        value: createAtomicExpression(),
      };

    case "if":
      return {
        id,
        type: "if",
        condition: createConditionExpression(),
        children: [],
        elifBranches: [],
        elseChildren: null,
      };

    case "while":
      return {
        id,
        type: "while",
        condition: createConditionExpression(),
        children: [],
      };

    case "for":
      return {
        id,
        type: "for",
        variable: "i",
        start: createAtomicExpression("0"),
        end: createAtomicExpression("10"),
        children: [],
      };

    case "tryCatch":
      return {
        id,
        type: "tryCatch",
        catchErrorName: "error",
        tryChildren: [],
        catchChildren: [],
      };

    case "call":
      return {
        id,
        type: "call",
        functionId: -1,
        name: "function",
        paramNames: [],
        args: [],
      };
  }
}

function isAtomicExpression(
  expression: Expression
): expression is LiteralExpression | VariableReferenceExpression {
  return (
    expression.type === "literal" ||
    expression.type === "variableReference"
  );
}

function isExpressionStatement(
  expression: Expression
): expression is ExpressionStatementBlock {
  return (
    expression.type === "calculation" ||
    expression.type === "calculationChain" ||
    expression.type === "logic" ||
    expression.type === "comparisonChain" ||
    expression.type === "array" ||
    expression.type === "set" ||
    expression.type === "dictionary" ||
    expression.type === "call"
  );
}

function isExpressionStatementBlock(
  block: Block
): block is ExpressionStatementBlock {
  return (
    block.type === "calculation" ||
    block.type === "calculationChain" ||
    block.type === "logic" ||
    block.type === "comparisonChain" ||
    block.type === "array" ||
    block.type === "set" ||
    block.type === "dictionary" ||
    block.type === "call"
  );
}

function expressionContainsId(expression: Expression, id: number): boolean {
  if (expression.id === id) return true;

  if (expression.type === "calculation" || expression.type === "logic") {
    return (
      expressionContainsId(expression.left, id) ||
      expressionContainsId(expression.right, id)
    );
  }

  if (expression.type === "calculationChain") {
    return (
      expressionContainsId(expression.first, id) ||
      expression.operations.some((operation) =>
        expressionContainsId(operation.value, id)
      )
    );
  }

  if (expression.type === "comparisonChain") {
    return (
      expressionContainsId(expression.first, id) ||
      expression.comparisons.some((comparison) =>
        expressionContainsId(comparison.right, id)
      )
    );
  }

  if (expression.type === "array" || expression.type === "set") {
    return expression.items.some((item) => expressionContainsId(item, id));
  }

  if (expression.type === "dictionary") {
    return expression.entries.some(
      (entry) =>
        expressionContainsId(entry.key, id) ||
        expressionContainsId(entry.value, id)
    );
  }




  if (expression.type === "call") {
    return expression.args.some((argument) =>
      expressionContainsId(argument, id)
    );
  }

  return false;
}

function findExpressionById(
  expression: Expression,
  id: number
): Expression | null {
  if (expression.id === id) return expression;

  if (expression.type === "calculation" || expression.type === "logic") {
    return (
      findExpressionById(expression.left, id) ??
      findExpressionById(expression.right, id)
    );
  }

  if (expression.type === "calculationChain") {
    const inFirst = findExpressionById(expression.first, id);
    if (inFirst) return inFirst;

    for (const operation of expression.operations) {
      const found = findExpressionById(operation.value, id);
      if (found) return found;
    }
  }

  if (expression.type === "comparisonChain") {
    const inFirst = findExpressionById(expression.first, id);
    if (inFirst) return inFirst;

    for (const comparison of expression.comparisons) {
      const found = findExpressionById(comparison.right, id);
      if (found) return found;
    }
  }

  if (expression.type === "array" || expression.type === "set") {
    for (const item of expression.items) {
      const found = findExpressionById(item, id);
      if (found) return found;
    }
  }

  if (expression.type === "dictionary") {
    for (const entry of expression.entries) {
      const inKey = findExpressionById(entry.key, id);
      if (inKey) return inKey;
      const inValue = findExpressionById(entry.value, id);
      if (inValue) return inValue;
    }
  }




  if (expression.type === "call") {
    for (const argument of expression.args) {
      const found = findExpressionById(argument, id);
      if (found) return found;
    }
  }

  return null;
}

function updateExpressionById(
  expression: Expression,
  id: number,
  updater: (current: Expression) => Expression
): Expression {
  if (expression.id === id) return updater(expression);

  if (expression.type === "calculation") {
    return {
      ...expression,
      left: updateExpressionById(expression.left, id, updater),
      right: updateExpressionById(expression.right, id, updater),
    };
  }

  if (expression.type === "calculationChain") {
    return {
      ...expression,
      first: updateExpressionById(expression.first, id, updater),
      operations: expression.operations.map((operation) => ({
        ...operation,
        value: updateExpressionById(operation.value, id, updater),
      })),
    };
  }

  if (expression.type === "logic") {
    return {
      ...expression,
      left: updateExpressionById(expression.left, id, updater),
      right: updateExpressionById(expression.right, id, updater),
    };
  }

  if (expression.type === "comparisonChain") {
    return {
      ...expression,
      first: updateExpressionById(expression.first, id, updater),
      comparisons: expression.comparisons.map((comparison) => ({
        ...comparison,
        right: updateExpressionById(comparison.right, id, updater),
      })),
    };
  }

  if (expression.type === "array" || expression.type === "set") {
    return {
      ...expression,
      items: expression.items.map((item) =>
        updateExpressionById(item, id, updater)
      ),
    };
  }

  if (expression.type === "dictionary") {
    return {
      ...expression,
      entries: expression.entries.map((entry) => ({
        ...entry,
        key: updateExpressionById(entry.key, id, updater),
        value: updateExpressionById(entry.value, id, updater),
      })),
    };
  }




  if (expression.type === "call") {
    return {
      ...expression,
      args: expression.args.map((argument) =>
        updateExpressionById(argument, id, updater)
      ),
    };
  }

  return expression;
}

function findExpressionInBlock(block: Block, id: number): Expression | null {
  if (isExpressionStatementBlock(block)) {
    const found = findExpressionById(block, id);
    if (found) return found;
  }

  switch (block.type) {
    case "variable":
    case "print":
    case "return":
      return findExpressionById(block.value, id);

    case "parallelAssign":
      for (const value of block.values) {
        const found = findExpressionById(value, id);
        if (found) return found;
      }
      return null;

    case "if": {
      const inCondition = findExpressionById(block.condition, id);
      if (inCondition) return inCondition;

      const inChildren = findExpressionInBlocks(block.children, id);
      if (inChildren) return inChildren;

      for (const branch of block.elifBranches) {
        const inBranchCondition = findExpressionById(branch.condition, id);
        if (inBranchCondition) return inBranchCondition;

        const inBranchChildren = findExpressionInBlocks(branch.children, id);
        if (inBranchChildren) return inBranchChildren;
      }

      return block.elseChildren
        ? findExpressionInBlocks(block.elseChildren, id)
        : null;
    }

    case "while": {
      const inCondition = findExpressionById(block.condition, id);
      if (inCondition) return inCondition;
      return findExpressionInBlocks(block.children, id);
    }

    case "for": {
      const inStart = findExpressionById(block.start, id);
      if (inStart) return inStart;
      const inEnd = findExpressionById(block.end, id);
      if (inEnd) return inEnd;
      return findExpressionInBlocks(block.children, id);
    }

    case "tryCatch":
      return (
        findExpressionInBlocks(block.tryChildren, id) ??
        findExpressionInBlocks(block.catchChildren, id)
      );

    default:
      return null;
  }
}

function findExpressionInBlocks(
  blocks: Block[],
  id: number
): Expression | null {
  for (const block of blocks) {
    const found = findExpressionInBlock(block, id);
    if (found) return found;
  }

  return null;
}

function updateExpressionsInBlock(
  block: Block,
  id: number,
  updater: (current: Expression) => Expression
): Block {
  if (isExpressionStatementBlock(block)) {
    const updated = updateExpressionById(block, id, updater);
    return isExpressionStatement(updated) ? updated : block;
  }

  switch (block.type) {
    case "variable":
      return {
        ...block,
        value: updateExpressionById(block.value, id, updater),
      };

    case "parallelAssign":
      return {
        ...block,
        values: block.values.map((value) =>
          updateExpressionById(value, id, updater)
        ),
      };

    case "print":
      return {
        ...block,
        value: updateExpressionById(block.value, id, updater),
      };

    case "return":
      return {
        ...block,
        value: updateExpressionById(block.value, id, updater),
      };

    case "if":
      return {
        ...block,
        condition: updateExpressionById(block.condition, id, updater),
        children: updateExpressionsInBlocks(block.children, id, updater),
        elifBranches: block.elifBranches.map((branch) => ({
          ...branch,
          condition: updateExpressionById(branch.condition, id, updater),
          children: updateExpressionsInBlocks(branch.children, id, updater),
        })),
        elseChildren:
          block.elseChildren === null
            ? null
            : updateExpressionsInBlocks(block.elseChildren, id, updater),
      };

    case "while":
      return {
        ...block,
        condition: updateExpressionById(block.condition, id, updater),
        children: updateExpressionsInBlocks(block.children, id, updater),
      };

    case "for":
      return {
        ...block,
        start: updateExpressionById(block.start, id, updater),
        end: updateExpressionById(block.end, id, updater),
        children: updateExpressionsInBlocks(block.children, id, updater),
      };

    case "tryCatch":
      return {
        ...block,
        tryChildren: updateExpressionsInBlocks(
          block.tryChildren,
          id,
          updater
        ),
        catchChildren: updateExpressionsInBlocks(
          block.catchChildren,
          id,
          updater
        ),
      };
  }
}

function updateExpressionsInBlocks(
  blocks: Block[],
  id: number,
  updater: (current: Expression) => Expression
): Block[] {
  return blocks.map((block) => updateExpressionsInBlock(block, id, updater));
}

function blockContainsExpressionId(block: Block, id: number): boolean {
  return findExpressionInBlock(block, id) !== null;
}

function blockContainsBlockId(block: Block, id: number): boolean {
  if (block.id === id) return true;

  if (block.type === "if") {
    return (
      block.children.some((child) => blockContainsBlockId(child, id)) ||
      block.elifBranches.some((branch) =>
        branch.children.some((child) => blockContainsBlockId(child, id))
      ) ||
      (block.elseChildren?.some((child) =>
        blockContainsBlockId(child, id)
      ) ??
        false)
    );
  }

  if (block.type === "while" || block.type === "for") {
    return block.children.some((child) => blockContainsBlockId(child, id));
  }

  if (block.type === "tryCatch") {
    return (
      block.tryChildren.some((child) => blockContainsBlockId(child, id)) ||
      block.catchChildren.some((child) => blockContainsBlockId(child, id))
    );
  }

  return false;
}

function insertIntoBlocks(
  blockList: Block[],
  target: ListDropTarget,
  newBlock: Block
): Block[] {
  if (target.area === "root") {
    const updated = [...blockList];
    updated.splice(target.index, 0, newBlock);
    return updated;
  }

  return blockList.map((block) => {
    if (block.id === target.parentId) {
      if (
        target.area === "children" &&
        (block.type === "if" ||
          block.type === "while" ||
          block.type === "for")
      ) {
        const children = [...block.children];
        children.splice(target.index, 0, newBlock);
        return { ...block, children };
      }

      if (target.area === "elifChildren" && block.type === "if") {
        return {
          ...block,
          elifBranches: block.elifBranches.map((branch) => {
            if (branch.id !== target.branchId) return branch;
            const children = [...branch.children];
            children.splice(target.index, 0, newBlock);
            return { ...branch, children };
          }),
        };
      }

      if (
        target.area === "elseChildren" &&
        block.type === "if" &&
        block.elseChildren !== null
      ) {
        const elseChildren = [...block.elseChildren];
        elseChildren.splice(target.index, 0, newBlock);
        return { ...block, elseChildren };
      }

      if (target.area === "tryChildren" && block.type === "tryCatch") {
        const tryChildren = [...block.tryChildren];
        tryChildren.splice(target.index, 0, newBlock);
        return { ...block, tryChildren };
      }

      if (target.area === "catchChildren" && block.type === "tryCatch") {
        const catchChildren = [...block.catchChildren];
        catchChildren.splice(target.index, 0, newBlock);
        return { ...block, catchChildren };
      }
    }

    if (block.type === "if") {
      return {
        ...block,
        children: insertIntoBlocks(block.children, target, newBlock),
        elifBranches: block.elifBranches.map((branch) => ({
          ...branch,
          children: insertIntoBlocks(branch.children, target, newBlock),
        })),
        elseChildren:
          block.elseChildren === null
            ? null
            : insertIntoBlocks(block.elseChildren, target, newBlock),
      };
    }

    if (block.type === "while" || block.type === "for") {
      return {
        ...block,
        children: insertIntoBlocks(block.children, target, newBlock),
      };
    }

    if (block.type === "tryCatch") {
      return {
        ...block,
        tryChildren: insertIntoBlocks(block.tryChildren, target, newBlock),
        catchChildren: insertIntoBlocks(
          block.catchChildren,
          target,
          newBlock
        ),
      };
    }

    return block;
  });
}

function removeBlockById(
  blockList: Block[],
  id: number
): { updatedBlocks: Block[]; removedBlock: Block | null } {
  let removedBlock: Block | null = null;

  const updatedBlocks = blockList
    .map((block) => {
      if (block.id === id) {
        removedBlock = block;
        return null;
      }

      if (block.type === "if") {
        const childResult = removeBlockById(block.children, id);
        if (childResult.removedBlock) removedBlock = childResult.removedBlock;

        const elifBranches = block.elifBranches.map((branch) => {
          const result = removeBlockById(branch.children, id);
          if (result.removedBlock) removedBlock = result.removedBlock;
          return { ...branch, children: result.updatedBlocks };
        });

        const elseResult =
          block.elseChildren === null
            ? null
            : removeBlockById(block.elseChildren, id);

        if (elseResult?.removedBlock) {
          removedBlock = elseResult.removedBlock;
        }

        return {
          ...block,
          children: childResult.updatedBlocks,
          elifBranches,
          elseChildren: elseResult?.updatedBlocks ?? null,
        };
      }

      if (block.type === "while" || block.type === "for") {
        const result = removeBlockById(block.children, id);
        if (result.removedBlock) removedBlock = result.removedBlock;
        return { ...block, children: result.updatedBlocks };
      }

      if (block.type === "tryCatch") {
        const tryResult = removeBlockById(block.tryChildren, id);
        const catchResult = removeBlockById(block.catchChildren, id);

        if (tryResult.removedBlock) removedBlock = tryResult.removedBlock;
        if (catchResult.removedBlock) removedBlock = catchResult.removedBlock;

        return {
          ...block,
          tryChildren: tryResult.updatedBlocks,
          catchChildren: catchResult.updatedBlocks,
        };
      }

      return block;
    })
    .filter((block): block is Block => block !== null);

  return { updatedBlocks, removedBlock };
}

function findBlockById(blockList: Block[], id: number): Block | null {
  for (const block of blockList) {
    if (block.id === id) return block;

    if (block.type === "if") {
      const inChildren = findBlockById(block.children, id);
      if (inChildren) return inChildren;

      for (const branch of block.elifBranches) {
        const inBranch = findBlockById(branch.children, id);
        if (inBranch) return inBranch;
      }

      if (block.elseChildren) {
        const inElse = findBlockById(block.elseChildren, id);
        if (inElse) return inElse;
      }
    }

    if (block.type === "while" || block.type === "for") {
      const found = findBlockById(block.children, id);
      if (found) return found;
    }

    if (block.type === "tryCatch") {
      const inTry = findBlockById(block.tryChildren, id);
      if (inTry) return inTry;

      const inCatch = findBlockById(block.catchChildren, id);
      if (inCatch) return inCatch;
    }
  }

  return null;
}

function findBlockLocation(
  blockList: Block[],
  id: number,
  area: ListArea = "root",
  parentId?: number,
  branchId?: number
): ListDropTarget | null {
  for (let index = 0; index < blockList.length; index += 1) {
    const block = blockList[index];

    if (block.id === id) {
      if (area === "root") return { area: "root", index };
      if (area === "elifChildren") {
        return {
          area,
          parentId: parentId as number,
          branchId: branchId as number,
          index,
        };
      }
      return { area, parentId: parentId as number, index };
    }

    if (block.type === "if") {
      const inChildren = findBlockLocation(
        block.children,
        id,
        "children",
        block.id
      );
      if (inChildren) return inChildren;

      for (const branch of block.elifBranches) {
        const inBranch = findBlockLocation(
          branch.children,
          id,
          "elifChildren",
          block.id,
          branch.id
        );
        if (inBranch) return inBranch;
      }

      if (block.elseChildren) {
        const inElse = findBlockLocation(
          block.elseChildren,
          id,
          "elseChildren",
          block.id
        );
        if (inElse) return inElse;
      }
    }

    if (block.type === "while" || block.type === "for") {
      const found = findBlockLocation(
        block.children,
        id,
        "children",
        block.id
      );
      if (found) return found;
    }

    if (block.type === "tryCatch") {
      const inTry = findBlockLocation(
        block.tryChildren,
        id,
        "tryChildren",
        block.id
      );
      if (inTry) return inTry;

      const inCatch = findBlockLocation(
        block.catchChildren,
        id,
        "catchChildren",
        block.id
      );
      if (inCatch) return inCatch;
    }
  }

  return null;
}

function isSameListTarget(
  source: ListDropTarget,
  target: ListDropTarget
): boolean {
  if (source.area !== target.area) return false;
  if (source.area === "root" && target.area === "root") return true;

  if (source.area === "elifChildren" && target.area === "elifChildren") {
    return (
      source.parentId === target.parentId &&
      source.branchId === target.branchId
    );
  }

  return (
    "parentId" in source &&
    "parentId" in target &&
    source.parentId === target.parentId
  );
}

function adjustTargetAfterRemoval(
  blockList: Block[],
  blockId: number,
  target: ListDropTarget
): ListDropTarget {
  const sourceLocation = findBlockLocation(blockList, blockId);

  if (
    sourceLocation &&
    isSameListTarget(sourceLocation, target) &&
    sourceLocation.index < target.index
  ) {
    return { ...target, index: target.index - 1 };
  }

  return target;
}

function syncExpressionFunctionCalls(
  expression: Expression,
  functionId: number,
  nextName: string,
  nextParams: string[]
): Expression {
  if (expression.type === "calculation") {
    return {
      ...expression,
      left: syncExpressionFunctionCalls(
        expression.left,
        functionId,
        nextName,
        nextParams
      ),
      right: syncExpressionFunctionCalls(
        expression.right,
        functionId,
        nextName,
        nextParams
      ),
    };
  }

  if (expression.type === "calculationChain") {
    return {
      ...expression,
      first: syncExpressionFunctionCalls(
        expression.first,
        functionId,
        nextName,
        nextParams
      ),
      operations: expression.operations.map((operation) => ({
        ...operation,
        value: syncExpressionFunctionCalls(
          operation.value,
          functionId,
          nextName,
          nextParams
        ),
      })),
    };
  }

  if (expression.type === "logic") {
    return {
      ...expression,
      left: syncExpressionFunctionCalls(
        expression.left,
        functionId,
        nextName,
        nextParams
      ),
      right: syncExpressionFunctionCalls(
        expression.right,
        functionId,
        nextName,
        nextParams
      ),
    };
  }

  if (expression.type === "comparisonChain") {
    return {
      ...expression,
      first: syncExpressionFunctionCalls(
        expression.first,
        functionId,
        nextName,
        nextParams
      ),
      comparisons: expression.comparisons.map((comparison) => ({
        ...comparison,
        right: syncExpressionFunctionCalls(
          comparison.right,
          functionId,
          nextName,
          nextParams
        ),
      })),
    };
  }

  if (expression.type === "array" || expression.type === "set") {
    return {
      ...expression,
      items: expression.items.map((item) =>
        syncExpressionFunctionCalls(
          item,
          functionId,
          nextName,
          nextParams
        )
      ),
    };
  }

  if (expression.type === "dictionary") {
    return {
      ...expression,
      entries: expression.entries.map((entry) => ({
        ...entry,
        key: syncExpressionFunctionCalls(
          entry.key,
          functionId,
          nextName,
          nextParams
        ),
        value: syncExpressionFunctionCalls(
          entry.value,
          functionId,
          nextName,
          nextParams
        ),
      })),
    };
  }




  if (expression.type === "call") {
    const recursivelyUpdatedArgs = expression.args.map((argument) =>
      syncExpressionFunctionCalls(
        argument,
        functionId,
        nextName,
        nextParams
      )
    );

    if (expression.functionId !== functionId) {
      return { ...expression, args: recursivelyUpdatedArgs };
    }

    return {
      ...expression,
      name: nextName,
      paramNames: [...nextParams],
      args: nextParams.map(
        (_, index) =>
          recursivelyUpdatedArgs[index] ?? createAtomicExpression()
      ),
    };
  }

  return expression;
}

function syncFunctionCalls(
  blockList: Block[],
  functionId: number,
  nextName: string,
  nextParams: string[]
): Block[] {
  return blockList.map((block) => {
    if (isExpressionStatementBlock(block)) {
      return syncExpressionFunctionCalls(
        block,
        functionId,
        nextName,
        nextParams
      ) as ExpressionStatementBlock;
    }

    switch (block.type) {
      case "variable":
      case "print":
      case "return":
        return {
          ...block,
          value: syncExpressionFunctionCalls(
            block.value,
            functionId,
            nextName,
            nextParams
          ),
        };

      case "parallelAssign":
        return {
          ...block,
          values: block.values.map((value) =>
            syncExpressionFunctionCalls(
              value,
              functionId,
              nextName,
              nextParams
            )
          ),
        };

      case "if":
        return {
          ...block,
          condition: syncExpressionFunctionCalls(
            block.condition,
            functionId,
            nextName,
            nextParams
          ),
          children: syncFunctionCalls(
            block.children,
            functionId,
            nextName,
            nextParams
          ),
          elifBranches: block.elifBranches.map((branch) => ({
            ...branch,
            condition: syncExpressionFunctionCalls(
              branch.condition,
              functionId,
              nextName,
              nextParams
            ),
            children: syncFunctionCalls(
              branch.children,
              functionId,
              nextName,
              nextParams
            ),
          })),
          elseChildren:
            block.elseChildren === null
              ? null
              : syncFunctionCalls(
                  block.elseChildren,
                  functionId,
                  nextName,
                  nextParams
                ),
        };

      case "while":
        return {
          ...block,
          condition: syncExpressionFunctionCalls(
            block.condition,
            functionId,
            nextName,
            nextParams
          ),
          children: syncFunctionCalls(
            block.children,
            functionId,
            nextName,
            nextParams
          ),
        };

      case "for":
        return {
          ...block,
          start: syncExpressionFunctionCalls(
            block.start,
            functionId,
            nextName,
            nextParams
          ),
          end: syncExpressionFunctionCalls(
            block.end,
            functionId,
            nextName,
            nextParams
          ),
          children: syncFunctionCalls(
            block.children,
            functionId,
            nextName,
            nextParams
          ),
        };

      case "tryCatch":
        return {
          ...block,
          tryChildren: syncFunctionCalls(
            block.tryChildren,
            functionId,
            nextName,
            nextParams
          ),
          catchChildren: syncFunctionCalls(
            block.catchChildren,
            functionId,
            nextName,
            nextParams
          ),
        };
    }
  });
}

function removeFunctionCallsFromExpression(
  expression: Expression,
  functionId: number
): Expression {
  if (expression.type === "call" && expression.functionId === functionId) {
    return createAtomicExpression();
  }

  if (expression.type === "calculation") {
    return {
      ...expression,
      left: removeFunctionCallsFromExpression(
        expression.left,
        functionId
      ),
      right: removeFunctionCallsFromExpression(
        expression.right,
        functionId
      ),
    };
  }

  if (expression.type === "calculationChain") {
    return {
      ...expression,
      first: removeFunctionCallsFromExpression(
        expression.first,
        functionId
      ),
      operations: expression.operations.map((operation) => ({
        ...operation,
        value: removeFunctionCallsFromExpression(
          operation.value,
          functionId
        ),
      })),
    };
  }

  if (expression.type === "logic") {
    return {
      ...expression,
      left: removeFunctionCallsFromExpression(
        expression.left,
        functionId
      ),
      right: removeFunctionCallsFromExpression(
        expression.right,
        functionId
      ),
    };
  }

  if (expression.type === "comparisonChain") {
    return {
      ...expression,
      first: removeFunctionCallsFromExpression(
        expression.first,
        functionId
      ),
      comparisons: expression.comparisons.map((comparison) => ({
        ...comparison,
        right: removeFunctionCallsFromExpression(
          comparison.right,
          functionId
        ),
      })),
    };
  }

  if (expression.type === "array" || expression.type === "set") {
    return {
      ...expression,
      items: expression.items.map((item) =>
        removeFunctionCallsFromExpression(item, functionId)
      ),
    };
  }

  if (expression.type === "dictionary") {
    return {
      ...expression,
      entries: expression.entries.map((entry) => ({
        ...entry,
        key: removeFunctionCallsFromExpression(entry.key, functionId),
        value: removeFunctionCallsFromExpression(
          entry.value,
          functionId
        ),
      })),
    };
  }




  if (expression.type === "call") {
    return {
      ...expression,
      args: expression.args.map((argument) =>
        removeFunctionCallsFromExpression(argument, functionId)
      ),
    };
  }

  return expression;
}

function removeFunctionCalls(
  blockList: Block[],
  functionId: number
): Block[] {
  return blockList
    .filter(
      (block) =>
        !(block.type === "call" && block.functionId === functionId)
    )
    .map((block) => {
      if (isExpressionStatementBlock(block)) {
        return removeFunctionCallsFromExpression(
          block,
          functionId
        ) as ExpressionStatementBlock;
      }

      switch (block.type) {
        case "variable":
        case "print":
        case "return":
          return {
            ...block,
            value: removeFunctionCallsFromExpression(
              block.value,
              functionId
            ),
          };

        case "parallelAssign":
          return {
            ...block,
            values: block.values.map((value) =>
              removeFunctionCallsFromExpression(value, functionId)
            ),
          };

        case "if":
          return {
            ...block,
            condition: removeFunctionCallsFromExpression(
              block.condition,
              functionId
            ),
            children: removeFunctionCalls(block.children, functionId),
            elifBranches: block.elifBranches.map((branch) => ({
              ...branch,
              condition: removeFunctionCallsFromExpression(
                branch.condition,
                functionId
              ),
              children: removeFunctionCalls(
                branch.children,
                functionId
              ),
            })),
            elseChildren:
              block.elseChildren === null
                ? null
                : removeFunctionCalls(
                    block.elseChildren,
                    functionId
                  ),
          };

        case "while":
          return {
            ...block,
            condition: removeFunctionCallsFromExpression(
              block.condition,
              functionId
            ),
            children: removeFunctionCalls(block.children, functionId),
          };

        case "for":
          return {
            ...block,
            start: removeFunctionCallsFromExpression(
              block.start,
              functionId
            ),
            end: removeFunctionCallsFromExpression(
              block.end,
              functionId
            ),
            children: removeFunctionCalls(block.children, functionId),
          };

        case "tryCatch":
          return {
            ...block,
            tryChildren: removeFunctionCalls(
              block.tryChildren,
              functionId
            ),
            catchChildren: removeFunctionCalls(
              block.catchChildren,
              functionId
            ),
          };
      }
    });
}

function serializeExpression(expression: Expression): JsonExpression {
  switch (expression.type) {
    case "literal":
      return {
        id: expression.id,
        type: "literal",
        dataType: expression.dataType,
        value: expression.value,
      };

    case "variableReference":
      return {
        id: expression.id,
        type: "variableReference",
        name: expression.name,
      };

    case "calculation":
      return {
        id: expression.id,
        type: "calculation",
        left: serializeExpression(expression.left),
        operator: expression.operator,
        right: serializeExpression(expression.right),
      };

    case "calculationChain":
      return {
        id: expression.id,
        type: "calculationChain",
        first: serializeExpression(expression.first),
        operations: expression.operations.map((operation) => ({
          operator: operation.operator,
          value: serializeExpression(operation.value),
        })),
      };

    case "logic":
      return {
        id: expression.id,
        type: "logic",
        left: serializeExpression(expression.left),
        operator: expression.operator,
        right: serializeExpression(expression.right),
      };

    case "comparisonChain":
      return {
        id: expression.id,
        type: "comparisonChain",
        first: serializeExpression(expression.first),
        comparisons: expression.comparisons.map((comparison) => ({
          operator: comparison.operator,
          right: serializeExpression(comparison.right),
        })),
      };

    case "array":
      return {
        id: expression.id,
        type: "array",
        items: expression.items.map(serializeExpression),
      };

    case "set":
      return {
        id: expression.id,
        type: "set",
        items: expression.items.map(serializeExpression),
      };

    case "dictionary":
      return {
        id: expression.id,
        type: "dictionary",
        entries: expression.entries.map((entry) => ({
          id: entry.id,
          key: serializeExpression(entry.key),
          value: serializeExpression(entry.value),
        })),
      };

    case "call":
      return {
        id: expression.id,
        type: "call",
        functionId: expression.functionId,
        name: expression.name,
        paramNames: [...expression.paramNames],
        args: expression.args.map(serializeExpression),
      };
  }
}

function serializeCondition(condition: Expression): JsonCondition {
  if (isAtomicExpression(condition)) return condition.source.trim();
  return serializeExpression(condition);
}

function serializeBlock(block: Block): JsonBlock {
  if (isExpressionStatementBlock(block)) {
    return serializeExpression(block) as Extract<
      JsonExpression,
      {
        type:
          | "calculation"
          | "calculationChain"
          | "logic"
          | "comparisonChain"
          | "array"
          | "set"
          | "dictionary"
          | "call";
      }
    >;
  }

  switch (block.type) {
    case "variable":
      return {
        id: block.id,
        type: "variable",
        name: block.name,
        value: serializeExpression(block.value),
      };

    case "parallelAssign":
      return {
        id: block.id,
        type: "parallelAssign",
        targets: [...block.targets],
        values: block.values.map(serializeExpression),
      };

    case "print":
      return {
        id: block.id,
        type: "print",
        value: serializeExpression(block.value),
      };

    case "return":
      return {
        id: block.id,
        type: "return",
        value: serializeExpression(block.value),
      };

    case "if":
      return {
        id: block.id,
        type: "if",
        condition: serializeCondition(block.condition),
        children: block.children.map(serializeBlock),
        elifBranches: block.elifBranches.map((branch) => ({
          id: branch.id,
          condition: serializeCondition(branch.condition),
          children: branch.children.map(serializeBlock),
        })),
        elseChildren:
          block.elseChildren === null
            ? null
            : block.elseChildren.map(serializeBlock),
      };

    case "while":
      return {
        id: block.id,
        type: "while",
        condition: serializeCondition(block.condition),
        children: block.children.map(serializeBlock),
      };

    case "for":
      return {
        id: block.id,
        type: "for",
        variable: block.variable,
        start: serializeExpression(block.start),
        end: serializeExpression(block.end),
        children: block.children.map(serializeBlock),
      };

    case "tryCatch":
      return {
        id: block.id,
        type: "tryCatch",
        catchErrorName: block.catchErrorName,
        tryChildren: block.tryChildren.map(serializeBlock),
        catchChildren: block.catchChildren.map(serializeBlock),
      };
  }
}

function collectConditionErrors(
  condition: Expression,
  location: string,
  errors: string[]
) {
  if (isAtomicExpression(condition)) {
    if (condition.source.trim() === "") {
      errors.push(`${location}: Condition cannot be empty.`);
    }
    return;
  }

  collectExpressionErrors(condition, location, errors);
}

function collectExpressionErrors(
  expression: Expression,
  location: string,
  errors: string[]
) {
  if (expression.type === "literal") {
    if (!expression.valid && expression.source.trim() !== "") {
      errors.push(`${location}: ${expression.error ?? "Invalid value."}`);
    }
    return;
  }

  if (expression.type === "variableReference") return;

  if (expression.type === "calculation" || expression.type === "logic") {
    collectExpressionErrors(expression.left, `${location}.left`, errors);
    collectExpressionErrors(expression.right, `${location}.right`, errors);
    return;
  }

  if (expression.type === "calculationChain") {
    collectExpressionErrors(expression.first, `${location}.first`, errors);
    expression.operations.forEach((operation, index) =>
      collectExpressionErrors(
        operation.value,
        `${location}.operations[${index}].value`,
        errors
      )
    );
    return;
  }

  if (expression.type === "comparisonChain") {
    collectExpressionErrors(expression.first, `${location}.first`, errors);
    expression.comparisons.forEach((comparison, index) =>
      collectExpressionErrors(
        comparison.right,
        `${location}.comparisons[${index}].right`,
        errors
      )
    );
    return;
  }

  if (expression.type === "array" || expression.type === "set") {
    expression.items.forEach((item, index) =>
      collectExpressionErrors(
        item,
        `${location}.items[${index}]`,
        errors
      )
    );
    return;
  }

  if (expression.type === "dictionary") {
    expression.entries.forEach((entry, index) => {
      collectExpressionErrors(
        entry.key,
        `${location}.entries[${index}].key`,
        errors
      );
      collectExpressionErrors(
        entry.value,
        `${location}.entries[${index}].value`,
        errors
      );
    });
    return;
  }




  expression.args.forEach((argument, index) =>
    collectExpressionErrors(argument, `${location}.args[${index}]`, errors)
  );
}

function collectBlockErrors(
  block: Block,
  location: string,
  errors: string[]
) {
  if (isExpressionStatementBlock(block)) {
    collectExpressionErrors(block, location, errors);
    return;
  }

  switch (block.type) {
    case "variable":
      if (block.name.trim() === "") {
        errors.push(`${location}.name: Variable name cannot be empty.`);
      }
      collectExpressionErrors(block.value, `${location}.value`, errors);
      return;

    case "parallelAssign":
      if (block.targets.length !== block.values.length) {
        errors.push(
          `${location}: Parallel assignment targets and values must match.`
        );
      }
      block.targets.forEach((target, index) => {
        if (target.trim() === "") {
          errors.push(
            `${location}.targets[${index}]: Variable name cannot be empty.`
          );
        }
      });
      block.values.forEach((value, index) =>
        collectExpressionErrors(
          value,
          `${location}.values[${index}]`,
          errors
        )
      );
      return;

    case "print":
    case "return":
      collectExpressionErrors(block.value, `${location}.value`, errors);
      return;

    case "if":
      collectConditionErrors(
        block.condition,
        `${location}.condition`,
        errors
      );
      block.children.forEach((child, index) =>
        collectBlockErrors(child, `${location}.children[${index}]`, errors)
      );
      block.elifBranches.forEach((branch, branchIndex) => {
        collectConditionErrors(
          branch.condition,
          `${location}.elifBranches[${branchIndex}].condition`,
          errors
        );
        branch.children.forEach((child, childIndex) =>
          collectBlockErrors(
            child,
            `${location}.elifBranches[${branchIndex}].children[${childIndex}]`,
            errors
          )
        );
      });
      block.elseChildren?.forEach((child, index) =>
        collectBlockErrors(
          child,
          `${location}.elseChildren[${index}]`,
          errors
        )
      );
      return;

    case "while":
      collectConditionErrors(
        block.condition,
        `${location}.condition`,
        errors
      );
      block.children.forEach((child, index) =>
        collectBlockErrors(child, `${location}.children[${index}]`, errors)
      );
      return;

    case "for":
      if (block.variable.trim() === "") {
        errors.push(`${location}.variable: Loop variable cannot be empty.`);
      }
      collectExpressionErrors(block.start, `${location}.start`, errors);
      collectExpressionErrors(block.end, `${location}.end`, errors);
      block.children.forEach((child, index) =>
        collectBlockErrors(child, `${location}.children[${index}]`, errors)
      );
      return;

    case "tryCatch":
      if (block.catchErrorName.trim() === "") {
        errors.push(
          `${location}.catchErrorName: Error variable cannot be empty.`
        );
      }
      block.tryChildren.forEach((child, index) =>
        collectBlockErrors(
          child,
          `${location}.tryChildren[${index}]`,
          errors
        )
      );
      block.catchChildren.forEach((child, index) =>
        collectBlockErrors(
          child,
          `${location}.catchChildren[${index}]`,
          errors
        )
      );
  }
}

function App() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [result, setResult] = useState("");
  const [zoom, setZoom] = useState(1);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [currentDropTarget, setCurrentDropTarget] =
    useState<DropTarget | null>(null);

  const [functions, setFunctions] = useState<UserFunction[]>([]);
  const [editingFunctionId, setEditingFunctionId] = useState<number | null>(
    null
  );
  const [openFunctionMenuId, setOpenFunctionMenuId] = useState<number | null>(
    null
  );
  const [functionToDeleteId, setFunctionToDeleteId] = useState<number | null>(
    null
  );
  const [openFunctionTabIds, setOpenFunctionTabIds] = useState<number[]>([]);
  const [activeBlockCategory, setActiveBlockCategory] =
    useState<BlockCategory>("basics");

  const editingFunction =
    editingFunctionId === null
      ? null
      : functions.find((func) => func.id === editingFunctionId) ?? null;

  const currentBlocks = editingFunction ? editingFunction.children : blocks;

  const programJson = {
    functions: functions.map((func) => ({
      id: func.id,
      type: "def" as const,
      name: func.name,
      params: [...func.params],
      children: func.children.map(serializeBlock),
    })),
    blocks: blocks.map(serializeBlock),
  };

  function getInputWidth(value: string, minWidth = 72, maxWidth = 240) {
    const textLength = value.length === 0 ? 4 : value.length;
    const calculatedWidth = textLength * 8 + 20;
    return Math.min(Math.max(minWidth, calculatedWidth), maxWidth);
  }

  function setCurrentBlocks(updater: Block[] | ((previous: Block[]) => Block[])) {
    if (editingFunction) {
      setFunctions((previous) =>
        previous.map((func) => {
          if (func.id !== editingFunction.id) return func;

          return {
            ...func,
            children:
              typeof updater === "function"
                ? updater(func.children)
                : updater,
          };
        })
      );
      return;
    }

    setBlocks(updater);
  }

  function updateBlockById(
    id: number,
    updater: (block: Block) => Block
  ) {
    function update(blockList: Block[]): Block[] {
      return blockList.map((block) => {
        if (block.id === id) return updater(block);

        if (block.type === "if") {
          return {
            ...block,
            children: update(block.children),
            elifBranches: block.elifBranches.map((branch) => ({
              ...branch,
              children: update(branch.children),
            })),
            elseChildren:
              block.elseChildren === null
                ? null
                : update(block.elseChildren),
          };
        }

        if (block.type === "while" || block.type === "for") {
          return { ...block, children: update(block.children) };
        }

        if (block.type === "tryCatch") {
          return {
            ...block,
            tryChildren: update(block.tryChildren),
            catchChildren: update(block.catchChildren),
          };
        }

        return block;
      });
    }

    setCurrentBlocks((previous) => update(previous));
  }

  function updateBlockField(id: number, field: string, value: unknown) {
    updateBlockById(
      id,
      (block) => ({ ...block, [field]: value }) as Block
    );
  }

  function updateCurrentExpression(
    id: number,
    updater: (current: Expression) => Expression
  ) {
    setCurrentBlocks((previous) =>
      updateExpressionsInBlocks(previous, id, updater)
    );
  }

  function replaceCurrentExpression(id: number, replacement: Expression) {
    updateCurrentExpression(id, () => replacement);
  }

  function updateAtomicExpression(id: number, source: string) {
    updateCurrentExpression(id, () => createAtomicExpression(source, id));
  }

  function updateConditionExpression(id: number, source: string) {
    updateCurrentExpression(id, () => createConditionExpression(source, id));
  }

  function updateExpressionField(
    id: number,
    field: "operator",
    value: MathOperator | LogicOperator
  ) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "calculation" && expression.type !== "logic") {
        return expression;
      }

      return { ...expression, [field]: value } as Expression;
    });
  }


  function addCalculationOperand(id: number) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type === "calculation") {
        return createCalculationChainExpression(expression);
      }

      if (expression.type === "calculationChain") {
        const operator =
          expression.operations.at(-1)?.operator ?? "+";
        return {
          ...expression,
          operations: [
            ...expression.operations,
            { operator, value: createAtomicExpression() },
          ],
        };
      }

      return expression;
    });
  }

  function updateCalculationChainOperator(
    id: number,
    index: number,
    operator: MathOperator
  ) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "calculationChain") return expression;
      return {
        ...expression,
        operations: expression.operations.map((operation, operationIndex) =>
          operationIndex === index
            ? { ...operation, operator }
            : operation
        ),
      };
    });
  }

  function removeCalculationOperand(id: number, index: number) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "calculationChain") return expression;

      const operations = expression.operations.filter(
        (_, operationIndex) => operationIndex !== index
      );

      if (operations.length === 1) {
        return {
          id: expression.id,
          type: "calculation",
          left: expression.first,
          operator: operations[0].operator,
          right: operations[0].value,
        };
      }

      return { ...expression, operations };
    });
  }

  function addComparisonOperand(id: number) {
    updateCurrentExpression(id, (expression) => {
      if (
        expression.type === "logic" &&
        expression.operator !== "and" &&
        expression.operator !== "or"
      ) {
        return createComparisonChainExpression(expression);
      }

      if (expression.type === "comparisonChain") {
        const operator =
          expression.comparisons.at(-1)?.operator ?? "==";
        return {
          ...expression,
          comparisons: [
            ...expression.comparisons,
            { operator, right: createAtomicExpression() },
          ],
        };
      }

      return expression;
    });
  }

  function updateComparisonChainOperator(
    id: number,
    index: number,
    operator: ComparisonOperator
  ) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "comparisonChain") return expression;
      return {
        ...expression,
        comparisons: expression.comparisons.map(
          (comparison, comparisonIndex) =>
            comparisonIndex === index
              ? { ...comparison, operator }
              : comparison
        ),
      };
    });
  }

  function removeComparisonOperand(id: number, index: number) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "comparisonChain") return expression;

      const comparisons = expression.comparisons.filter(
        (_, comparisonIndex) => comparisonIndex !== index
      );

      if (comparisons.length === 1) {
        return {
          id: expression.id,
          type: "logic",
          left: expression.first,
          operator: comparisons[0].operator,
          right: comparisons[0].right,
        };
      }

      return { ...expression, comparisons };
    });
  }

  function addCollectionItem(id: number) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "array" && expression.type !== "set") {
        return expression;
      }

      return {
        ...expression,
        items: [...expression.items, createAtomicExpression()],
      };
    });
  }

  function removeCollectionItem(id: number, index: number) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "array" && expression.type !== "set") {
        return expression;
      }

      return {
        ...expression,
        items: expression.items.filter(
          (_, itemIndex) => itemIndex !== index
        ),
      };
    });
  }

  function addDictionaryEntry(id: number) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "dictionary") return expression;

      return {
        ...expression,
        entries: [
          ...expression.entries,
          {
            id: makeId(),
            key: createAtomicExpression(),
            value: createAtomicExpression(),
          },
        ],
      };
    });
  }

  function removeDictionaryEntry(id: number, entryId: number) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "dictionary") return expression;

      return {
        ...expression,
        entries: expression.entries.filter(
          (entry) => entry.id !== entryId
        ),
      };
    });
  }

  function expandVariableAssignment(blockId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "variable") return block;

      return {
        id: block.id,
        type: "parallelAssign",
        targets: [block.name, ""],
        values: [block.value, createAtomicExpression()],
      };
    });
  }

  function updateParallelTarget(
    blockId: number,
    index: number,
    value: string
  ) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "parallelAssign") return block;
      return {
        ...block,
        targets: block.targets.map((target, targetIndex) =>
          targetIndex === index
            ? sanitizeIdentifierInput(value)
            : target
        ),
      };
    });
  }

  function addParallelPair(blockId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "parallelAssign") return block;
      return {
        ...block,
        targets: [...block.targets, ""],
        values: [...block.values, createAtomicExpression()],
      };
    });
  }

  function removeParallelPair(blockId: number, index: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "parallelAssign") return block;

      const targets = block.targets.filter(
        (_, targetIndex) => targetIndex !== index
      );
      const values = block.values.filter(
        (_, valueIndex) => valueIndex !== index
      );

      if (targets.length === 1) {
        return {
          id: block.id,
          type: "variable",
          name: targets[0],
          value: values[0],
        };
      }

      return {
        ...block,
        targets,
        values,
      };
    });
  }

  function addElifBranch(blockId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "if") return block;
      return {
        ...block,
        elifBranches: [
          ...block.elifBranches,
          {
            id: makeId(),
            condition: createConditionExpression(),
            children: [],
          },
        ],
      };
    });
  }

  function removeElifBranch(blockId: number, branchId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "if") return block;
      return {
        ...block,
        elifBranches: block.elifBranches.filter(
          (branch) => branch.id !== branchId
        ),
      };
    });
  }

  function addElseBranch(blockId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "if" || block.elseChildren !== null) return block;
      return { ...block, elseChildren: [] };
    });
  }

  function removeElseBranch(blockId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "if") return block;
      return { ...block, elseChildren: null };
    });
  }

  function getDropTargetKey(target: DropTarget) {
    if (target.area === "root") return `root-${target.index}`;
    if (target.area === "expression") {
      return `expression-${target.expressionId}`;
    }
    if (target.area === "elifChildren") {
      return `${target.area}-${target.parentId}-${target.branchId}-${target.index}`;
    }
    return `${target.area}-${target.parentId}-${target.index}`;
  }

  function handleTemplateDragStart(
    event: DragEvent<HTMLDivElement>,
    type: BlockType
  ) {
    event.dataTransfer.setData("source", "template");
    event.dataTransfer.setData("blockType", type);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleWorkspaceBlockDragStart(
    event: DragEvent<HTMLDivElement>,
    id: number
  ) {
    event.stopPropagation();
    event.dataTransfer.setData("source", "workspace");
    event.dataTransfer.setData("blockId", String(id));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleExpressionDragStart(
    event: DragEvent<HTMLDivElement>,
    id: number
  ) {
    event.stopPropagation();
    event.dataTransfer.setData("source", "expression");
    event.dataTransfer.setData("expressionId", String(id));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDropZoneDragOver(
    event: DragEvent<HTMLElement>,
    target: DropTarget
  ) {
    event.preventDefault();
    event.stopPropagation();
    setActiveDropTarget(getDropTargetKey(target));
    setCurrentDropTarget(target);
  }

  function handleDragEnd() {
    setActiveDropTarget(null);
    setCurrentDropTarget(null);
  }

  function handleDrop(event: DragEvent<HTMLElement>, target: DropTarget) {
    event.preventDefault();
    event.stopPropagation();

    const finalTarget = currentDropTarget ?? target;
    const source = event.dataTransfer.getData("source");

    if (source === "template") {
      const blockType = event.dataTransfer.getData("blockType") as BlockType;

      if (finalTarget.area === "expression" && blockType) {
        const createdBlock = createBlock(blockType);

        if (isExpressionStatementBlock(createdBlock)) {
          replaceCurrentExpression(
            finalTarget.expressionId,
            createdBlock
          );
        }
      } else if (blockType && finalTarget.area !== "expression") {
        setCurrentBlocks((previous) =>
          insertIntoBlocks(previous, finalTarget, createBlock(blockType))
        );
      }
    }

    if (source === "function") {
      const functionId = Number(event.dataTransfer.getData("functionId"));
      const func = functions.find((item) => item.id === functionId);

      if (func) {
        const call = createCallExpression(func);

        if (finalTarget.area === "expression") {
          replaceCurrentExpression(finalTarget.expressionId, call);
        } else {
          setCurrentBlocks((previous) =>
            insertIntoBlocks(previous, finalTarget, call)
          );
        }
      }
    }

    if (source === "workspace") {
      const blockId = Number(event.dataTransfer.getData("blockId"));

      if (!Number.isNaN(blockId)) {
        setCurrentBlocks((previous) => {
          const movingBlock = findBlockById(previous, blockId);
          if (!movingBlock) return previous;

          if (finalTarget.area === "expression") {
            if (!isExpressionStatementBlock(movingBlock)) return previous;

            if (
              blockContainsExpressionId(
                movingBlock,
                finalTarget.expressionId
              )
            ) {
              return previous;
            }

            const removal = removeBlockById(previous, blockId);
            if (!removal.removedBlock) return previous;

            return updateExpressionsInBlocks(
              removal.updatedBlocks,
              finalTarget.expressionId,
              () => movingBlock
            );
          }

          if (
            "parentId" in finalTarget &&
            blockContainsBlockId(movingBlock, finalTarget.parentId)
          ) {
            return previous;
          }

          const adjustedTarget = adjustTargetAfterRemoval(
            previous,
            blockId,
            finalTarget
          );
          const removal = removeBlockById(previous, blockId);

          if (!removal.removedBlock) return previous;

          return insertIntoBlocks(
            removal.updatedBlocks,
            adjustedTarget,
            removal.removedBlock
          );
        });
      }
    }

    if (source === "expression") {
      const expressionId = Number(event.dataTransfer.getData("expressionId"));

      if (!Number.isNaN(expressionId)) {
        setCurrentBlocks((previous) => {
          const movingExpression = findExpressionInBlocks(previous, expressionId);
          if (!movingExpression) return previous;

          if (finalTarget.area === "expression") {
            if (expressionId === finalTarget.expressionId) return previous;
            if (
              expressionContainsId(
                movingExpression,
                finalTarget.expressionId
              )
            ) {
              return previous;
            }

            const withoutSource = updateExpressionsInBlocks(
              previous,
              expressionId,
              () => createAtomicExpression()
            );

            return updateExpressionsInBlocks(
              withoutSource,
              finalTarget.expressionId,
              () => movingExpression
            );
          }

          if (!isExpressionStatement(movingExpression)) return previous;

          const withoutSource = updateExpressionsInBlocks(
            previous,
            expressionId,
            () => createAtomicExpression()
          );

          return insertIntoBlocks(
            withoutSource,
            finalTarget,
            movingExpression
          );
        });
      }
    }

    setActiveDropTarget(null);
    setCurrentDropTarget(null);
  }

  function addBlock(type: BlockType) {
    setCurrentBlocks((previous) => [...previous, createBlock(type)]);
  }

  function deleteBlock(id: number) {
    const result = removeBlockById(currentBlocks, id);
    setCurrentBlocks(result.updatedBlocks);
  }

  function zoomIn() {
    setZoom((previous) => Math.min(previous + 0.1, 1.6));
  }

  function zoomOut() {
    setZoom((previous) => Math.max(previous - 0.1, 0.6));
  }

  function resetZoom() {
    setZoom(1);
  }

  function createFunction() {
    const newFunction: UserFunction = {
      id: makeId(),
      name: `myFunction${functions.length + 1}`,
      params: [],
      children: [],
    };

    setFunctions((previous) => [...previous, newFunction]);
    setOpenFunctionTabIds((previous) => [...previous, newFunction.id]);
    setEditingFunctionId(newFunction.id);
  }

  function openFunctionTab(id: number) {
    setOpenFunctionTabIds((previous) =>
      previous.includes(id) ? previous : [...previous, id]
    );
    setEditingFunctionId(id);
    setOpenFunctionMenuId(null);
  }

  function closeFunctionTab(id: number) {
    setOpenFunctionTabIds((previous) =>
      previous.filter((tabId) => tabId !== id)
    );

    if (editingFunctionId === id) setEditingFunctionId(null);
  }

  function requestDeleteFunction(id: number) {
    setFunctionToDeleteId(id);
    setOpenFunctionMenuId(null);
  }

  function cancelDeleteFunction() {
    setFunctionToDeleteId(null);
  }

  function confirmDeleteFunction() {
    if (functionToDeleteId === null) return;
    deleteFunction(functionToDeleteId);
    setFunctionToDeleteId(null);
  }

  function updateFunctionName(id: number, name: string) {
    const sanitizedName = sanitizeIdentifierInput(name);
    const currentFunction = functions.find((func) => func.id === id);
    const params = currentFunction?.params ?? [];

    setFunctions((previous) =>
      previous.map((func) => {
        const updatedFunction =
          func.id === id ? { ...func, name: sanitizedName } : func;
        return {
          ...updatedFunction,
          children: syncFunctionCalls(
            updatedFunction.children,
            id,
            sanitizedName,
            params
          ),
        };
      })
    );

    setBlocks((previous) =>
      syncFunctionCalls(previous, id, sanitizedName, params)
    );
  }

  function updateFunctionParams(id: number, nextParams: string[]) {
    const currentFunction = functions.find((func) => func.id === id);
    if (!currentFunction) return;

    setFunctions((previous) =>
      previous.map((func) => {
        const updatedFunction =
          func.id === id ? { ...func, params: nextParams } : func;

        return {
          ...updatedFunction,
          children: syncFunctionCalls(
            updatedFunction.children,
            id,
            currentFunction.name,
            nextParams
          ),
        };
      })
    );

    setBlocks((previous) =>
      syncFunctionCalls(previous, id, currentFunction.name, nextParams)
    );
  }

  function addParameter(id: number) {
    const func = functions.find((item) => item.id === id);
    if (!func) return;
    updateFunctionParams(id, [...func.params, ""]);
  }

  function updateParameter(id: number, index: number, value: string) {
    const sanitizedValue = sanitizeIdentifierInput(value);
    const func = functions.find((item) => item.id === id);
    if (!func) return;
    const nextParams = [...func.params];
    nextParams[index] = sanitizedValue;
    updateFunctionParams(id, nextParams);
  }

  function deleteParameter(id: number, index: number) {
    const func = functions.find((item) => item.id === id);
    if (!func) return;
    updateFunctionParams(
      id,
      func.params.filter((_, paramIndex) => paramIndex !== index)
    );
  }

  function deleteFunction(id: number) {
    setFunctions((previous) =>
      previous
        .filter((func) => func.id !== id)
        .map((func) => ({
          ...func,
          children: removeFunctionCalls(func.children, id),
        }))
    );

    setOpenFunctionTabIds((previous) =>
      previous.filter((tabId) => tabId !== id)
    );

    if (editingFunctionId === id) setEditingFunctionId(null);
    setBlocks((previous) => removeFunctionCalls(previous, id));
  }

  function addFunctionCall(func: UserFunction) {
    setCurrentBlocks((previous) => [...previous, createCallExpression(func)]);
  }

  async function checkFlow() {
    const validationErrors: string[] = [];

    blocks.forEach((block, index) =>
      collectBlockErrors(block, `blocks[${index}]`, validationErrors)
    );

    functions.forEach((func, functionIndex) =>
      func.children.forEach((block, blockIndex) =>
        collectBlockErrors(
          block,
          `functions[${functionIndex}].children[${blockIndex}]`,
          validationErrors
        )
      )
    );

    if (validationErrors.length > 0) {
      setResult(`Fix these input values before running:\n${validationErrors.join("\n")}`);
      return;
    }

    try {
      const response = await fetch("http://localhost:3000/check-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(programJson),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult(`Server Error: ${data.error || "Something went wrong."}`);
        return;
      }

      if (data.status === "error" || data.error) {
        setResult(`Runtime Error: ${data.error || "Program could not run."}`);
        return;
      }

      if (Array.isArray(data.output) && data.output.length > 0) {
        setResult(data.output.join("\n"));
        return;
      }

      setResult("Program finished with no output.");
    } catch (error) {
      console.error(error);
      setResult("Connection Error: Could not connect to backend.");
    }
  }

  function renderPaletteBlock(
    label: string,
    type: BlockType,
    className: string
  ) {
    return (
      <div
        className={`template-block ${className}`}
        draggable
        onDragStart={(event) => handleTemplateDragStart(event, type)}
        onDragEnd={handleDragEnd}
        onClick={() => addBlock(type)}
      >
        {label}
      </div>
    );
  }

  function renderDropZone(target: ListDropTarget) {
    const key = getDropTargetKey(target);

    return (
      <div
        className={`insert-drop-zone ${
          activeDropTarget === key ? "active-insert-zone" : ""
        }`}
        onDragOver={(event) => handleDropZoneDragOver(event, target)}
        onDrop={(event) => handleDrop(event, target)}
      >
        {activeDropTarget === key && <span>Drop here</span>}
      </div>
    );
  }

  function makeListTarget(
    area: ListArea,
    index: number,
    parentId?: number,
    branchId?: number
  ): ListDropTarget {
    if (area === "root") return { area: "root", index };
    if (area === "elifChildren") {
      return {
        area,
        parentId: parentId as number,
        branchId: branchId as number,
        index,
      };
    }
    return { area, parentId: parentId as number, index };
  }

  function renderNestedArea(
    blockList: Block[],
    area: Exclude<ListArea, "root">,
    parentId: number,
    branchId?: number,
    placeholder = "Drop statement blocks here"
  ) {
    const endTarget = makeListTarget(
      area,
      blockList.length,
      parentId,
      branchId
    );

    return (
      <div
        className={`nested-area ${
          activeDropTarget === getDropTargetKey(endTarget)
            ? "active-nested-area"
            : ""
        }`}
        onDragOver={(event) =>
          handleDropZoneDragOver(event, endTarget)
        }
        onDrop={(event) => handleDrop(event, endTarget)}
      >
        {blockList.length === 0 && (
          <div className="nested-placeholder">{placeholder}</div>
        )}
        {renderBlockList(blockList, area, parentId, branchId)}
      </div>
    );
  }

  function getBlockHoverTarget(
    event: DragEvent<HTMLDivElement>,
    area: ListArea,
    index: number,
    parentId?: number,
    branchId?: number
  ): ListDropTarget {
    const rect = event.currentTarget.getBoundingClientRect();
    const targetIndex =
      event.clientY < rect.top + rect.height / 2 ? index : index + 1;

    return makeListTarget(area, targetIndex, parentId, branchId);
  }

  function renderBlockList(
    blockList: Block[],
    area: ListArea,
    parentId?: number,
    branchId?: number
  ) {
    return (
      <>
        {renderDropZone(
          makeListTarget(area, 0, parentId, branchId)
        )}

        {blockList.map((block, index) => (
          <div
            key={block.id}
            className="block-wrapper"
            onDragOver={(event) => {
              const target = getBlockHoverTarget(
                event,
                area,
                index,
                parentId,
                branchId
              );
              handleDropZoneDragOver(event, target);
            }}
            onDrop={(event) => {
              const target = getBlockHoverTarget(
                event,
                area,
                index,
                parentId,
                branchId
              );
              handleDrop(event, target);
            }}
          >
            {renderBlock(block)}
            {renderDropZone(
              makeListTarget(
                area,
                index + 1,
                parentId,
                branchId
              )
            )}
          </div>
        ))}
      </>
    );
  }

  function renderExpressionSlot(
    expression: Expression,
    placeholder: string,
    className = "",
    minWidth = 88,
    maxWidth = 230,
    options: { showBadge?: boolean; condition?: boolean } = {}
  ) {
    const { showBadge = true, condition = false } = options;
    const target: ExpressionDropTarget = {
      area: "expression",
      expressionId: expression.id,
    };
    const key = getDropTargetKey(target);
    const active = activeDropTarget === key;
    const invalid =
      !condition && expression.type === "literal" && !expression.valid;

    return (
      <div
        className={`expression-slot ${
          isAtomicExpression(expression)
            ? "atomic-expression-slot"
            : "composite-expression-slot"
        } ${active ? "active-expression-slot" : ""} ${
          invalid ? "invalid-expression-slot" : ""
        } ${className}`}
        title={invalid ? expression.error : undefined}
        onDragOver={(event) => handleDropZoneDragOver(event, target)}
        onDrop={(event) => handleDrop(event, target)}
      >
        {isAtomicExpression(expression) ? (
          <>
            {showBadge && (
              <span className="atomic-kind-badge">
                {expression.type === "variableReference"
                  ? "ref"
                  : expression.dataType === "string"
                    ? "str"
                    : expression.dataType}
              </span>
            )}
            <input
              className="atomic-expression-input"
              placeholder={placeholder}
              value={expression.source}
              style={{
                width: getInputWidth(expression.source, minWidth, maxWidth),
              }}
              onChange={(event) =>
                condition
                  ? updateConditionExpression(
                      expression.id,
                      event.target.value
                    )
                  : updateAtomicExpression(expression.id, event.target.value)
              }
              onDragStart={(event) => event.stopPropagation()}
            />
          </>
        ) : (
          <>
            {renderNestedExpression(expression)}
            <button
              className="clear-expression-button"
              title="Clear nested expression"
              onClick={(event) => {
                event.stopPropagation();
                replaceCurrentExpression(
                  expression.id,
                  condition
                    ? createConditionExpression()
                    : createAtomicExpression()
                );
              }}
            >
              ×
            </button>
          </>
        )}
      </div>
    );
  }

  function renderMathOperatorOptions() {
    return (
      <>
        <option value="+">+</option>
        <option value="-">−</option>
        <option value="*">×</option>
        <option value="/">÷</option>
        <option value="%">%</option>
      </>
    );
  }

  function renderComparisonOperatorOptions() {
    return (
      <>
        <option value="==">==</option>
        <option value="!=">!=</option>
        <option value=">">&gt;</option>
        <option value="<">&lt;</option>
        <option value=">=">&gt;=</option>
        <option value="<=">&lt;=</option>
      </>
    );
  }

  function renderCalculationContent(
    expression: CalculationExpression | CalculationChainExpression
  ) {
    if (expression.type === "calculation") {
      return (
        <div className="expression-content-row chain-expression-row">
          {renderExpressionSlot(expression.left, "value")}
          <select
            value={expression.operator}
            onChange={(event) =>
              updateExpressionField(
                expression.id,
                "operator",
                event.target.value as MathOperator
              )
            }
          >
            {renderMathOperatorOptions()}
          </select>
          {renderExpressionSlot(expression.right, "value")}
          <button
            className="expand-expression-button"
            title="Add another calculation value"
            onClick={(event) => {
              event.stopPropagation();
              addCalculationOperand(expression.id);
            }}
          >
            +
          </button>
        </div>
      );
    }

    return (
      <div className="expression-content-row chain-expression-row">
        {renderExpressionSlot(expression.first, "value")}

        {expression.operations.map((operation, index) => (
          <div
            className="chain-segment"
            key={operation.value.id}
          >
            <select
              value={operation.operator}
              onChange={(event) =>
                updateCalculationChainOperator(
                  expression.id,
                  index,
                  event.target.value as MathOperator
                )
              }
            >
              {renderMathOperatorOptions()}
            </select>

            {renderExpressionSlot(operation.value, "value")}

            <button
              className="remove-chain-button"
              title="Remove this calculation value"
              onClick={(event) => {
                event.stopPropagation();
                removeCalculationOperand(expression.id, index);
              }}
            >
              ×
            </button>
          </div>
        ))}

        <button
          className="expand-expression-button"
          title="Add another calculation value"
          onClick={(event) => {
            event.stopPropagation();
            addCalculationOperand(expression.id);
          }}
        >
          +
        </button>
      </div>
    );
  }

  function renderLogicContent(expression: LogicExpression) {
    const canExpand =
      expression.operator !== "and" && expression.operator !== "or";

    return (
      <div className="expression-content-row chain-expression-row">
        {renderExpressionSlot(expression.left, "value")}
        <select
          value={expression.operator}
          onChange={(event) =>
            updateExpressionField(
              expression.id,
              "operator",
              event.target.value as LogicOperator
            )
          }
        >
          {renderComparisonOperatorOptions()}
          <option value="and">and</option>
          <option value="or">or</option>
        </select>
        {renderExpressionSlot(expression.right, "value")}

        {canExpand && (
          <button
            className="expand-expression-button"
            title="Add another comparison"
            onClick={(event) => {
              event.stopPropagation();
              addComparisonOperand(expression.id);
            }}
          >
            +
          </button>
        )}
      </div>
    );
  }

  function renderComparisonChainContent(
    expression: ComparisonChainExpression
  ) {
    return (
      <div className="expression-content-row chain-expression-row">
        {renderExpressionSlot(expression.first, "value")}

        {expression.comparisons.map((comparison, index) => (
          <div
            className="chain-segment"
            key={comparison.right.id}
          >
            <select
              value={comparison.operator}
              onChange={(event) =>
                updateComparisonChainOperator(
                  expression.id,
                  index,
                  event.target.value as ComparisonOperator
                )
              }
            >
              {renderComparisonOperatorOptions()}
            </select>

            {renderExpressionSlot(comparison.right, "value")}

            <button
              className="remove-chain-button"
              title="Remove this comparison"
              onClick={(event) => {
                event.stopPropagation();
                removeComparisonOperand(expression.id, index);
              }}
            >
              ×
            </button>
          </div>
        ))}

        <button
          className="expand-expression-button"
          title="Add another comparison"
          onClick={(event) => {
            event.stopPropagation();
            addComparisonOperand(expression.id);
          }}
        >
          +
        </button>
      </div>
    );
  }

  function renderCollectionContent(
    expression: ArrayExpression | SetExpression
  ) {
    const opening = expression.type === "array" ? "[" : "{";
    const closing = expression.type === "array" ? "]" : "}";

    return (
      <div className="expression-content-row collection-content-row">
        {expression.type === "set" && (
          <span className="collection-label">set</span>
        )}
        <span className="collection-bracket">{opening}</span>

        {expression.items.length === 0 && (
          <span className="empty-collection-label">empty</span>
        )}

        {expression.items.map((item, index) => (
          <div className="collection-item" key={item.id}>
            {renderExpressionSlot(
              item,
              `item ${index + 1}`,
              "collection-item-slot",
              70,
              170
            )}
            <button
              className="remove-chain-button"
              title="Remove this item"
              onClick={(event) => {
                event.stopPropagation();
                removeCollectionItem(expression.id, index);
              }}
            >
              ×
            </button>
            {index < expression.items.length - 1 && <span>,</span>}
          </div>
        ))}

        <span className="collection-bracket">{closing}</span>
        <button
          className="expand-expression-button"
          title="Add another item"
          onClick={(event) => {
            event.stopPropagation();
            addCollectionItem(expression.id);
          }}
        >
          +
        </button>
      </div>
    );
  }

  function renderDictionaryContent(expression: DictionaryExpression) {
    return (
      <div className="expression-content-row dictionary-content-row">
        <span className="collection-bracket">{"{"}</span>

        {expression.entries.length === 0 && (
          <span className="empty-collection-label">empty</span>
        )}

        {expression.entries.map((entry, index) => (
          <div className="dictionary-entry" key={entry.id}>
            {renderExpressionSlot(
              entry.key,
              `key ${index + 1}`,
              "dictionary-key-slot",
              68,
              150
            )}
            <span>:</span>
            {renderExpressionSlot(
              entry.value,
              `value ${index + 1}`,
              "dictionary-value-slot",
              74,
              170
            )}
            <button
              className="remove-chain-button"
              title="Remove this key-value pair"
              onClick={(event) => {
                event.stopPropagation();
                removeDictionaryEntry(expression.id, entry.id);
              }}
            >
              ×
            </button>
            {index < expression.entries.length - 1 && <span>,</span>}
          </div>
        ))}

        <span className="collection-bracket">{"}"}</span>
        <button
          className="expand-expression-button"
          title="Add another key-value pair"
          onClick={(event) => {
            event.stopPropagation();
            addDictionaryEntry(expression.id);
          }}
        >
          +
        </button>
      </div>
    );
  }

  function renderCallContent(expression: CallExpression) {
    return (
      <div className="expression-content-row function-call-row">
        <span className="function-call-name">{expression.name}</span>
        <span>(</span>

        {expression.args.length === 0 && (
          <span className="no-arguments-label">no args</span>
        )}

        {expression.args.map((argument, index) => (
          <div key={argument.id} className="function-argument-item">
            {renderExpressionSlot(
              argument,
              expression.paramNames[index] || `arg ${index + 1}`,
              "function-argument-slot",
              78,
              170
            )}
            {index < expression.args.length - 1 && <span>,</span>}
          </div>
        ))}

        <span>)</span>
      </div>
    );
  }

  function renderNestedExpression(expression: ExpressionStatementBlock) {
    const expressionClass =
      expression.type === "calculation" ||
      expression.type === "calculationChain"
        ? "calculation-expression"
        : expression.type === "logic" ||
            expression.type === "comparisonChain"
          ? "logic-expression"
          : expression.type === "array" ||
              expression.type === "set" ||
              expression.type === "dictionary"
            ? "collection-expression"
            : "call-expression";

    return (
      <div
        className={`nested-expression ${expressionClass}`}
        draggable
        onDragStart={(event) =>
          handleExpressionDragStart(event, expression.id)
        }
        onDragEnd={handleDragEnd}
      >
        <span className="expression-grip" title="Drag nested expression">
          ⋮⋮
        </span>
        {(expression.type === "calculation" ||
          expression.type === "calculationChain") &&
          renderCalculationContent(expression)}
        {expression.type === "logic" &&
          renderLogicContent(expression)}
        {expression.type === "comparisonChain" &&
          renderComparisonChainContent(expression)}
        {(expression.type === "array" || expression.type === "set") &&
          renderCollectionContent(expression)}
        {expression.type === "dictionary" &&
          renderDictionaryContent(expression)}
        {expression.type === "call" && renderCallContent(expression)}
      </div>
    );
  }

  function isContainerBlock(block: Block) {
    return (
      block.type === "if" ||
      block.type === "while" ||
      block.type === "for" ||
      block.type === "tryCatch"
    );
  }

  function renderBlock(block: Block) {
    return (
      <div
        className={`scratch-block ${block.type}-block ${
          isContainerBlock(block) ? "container-block" : ""
        }`}
        draggable
        onDragStart={(event) =>
          handleWorkspaceBlockDragStart(event, block.id)
        }
        onDragEnd={handleDragEnd}
      >
        <button
          className="delete-button"
          onClick={() => deleteBlock(block.id)}
        >
          ×
        </button>

        {block.type === "variable" && (
          <div className="block-row expression-enabled-row">
            <input
              placeholder="name"
              value={block.name}
              style={{ width: getInputWidth(block.name, 72, 160) }}
              onChange={(event) =>
                updateBlockField(
                  block.id,
                  "name",
                  sanitizeIdentifierInput(event.target.value)
                )
              }
            />

            <span>=</span>

            {renderExpressionSlot(
              block.value,
              "value",
              "variable-value-slot",
              70,
              180
            )}

            <button
              className="expand-expression-button"
              title="Add another variable and value"
              onClick={(event) => {
                event.stopPropagation();
                expandVariableAssignment(block.id);
              }}
            >
              +
            </button>
          </div>
        )}

        {block.type === "parallelAssign" && (
          <div className="block-row expression-enabled-row parallel-assignment-row">
            <div className="parallel-side parallel-targets">
              {block.targets.map((target, index) => (
                <div
                  className="parallel-item"
                  key={`target-${index}`}
                >
                  <input
                    placeholder={`name ${index + 1}`}
                    value={target}
                    style={{
                      width: getInputWidth(target, 68, 130),
                    }}
                    onChange={(event) =>
                      updateParallelTarget(
                        block.id,
                        index,
                        event.target.value
                      )
                    }
                  />
                  {index < block.targets.length - 1 && (
                    <span>,</span>
                  )}
                </div>
              ))}
            </div>

            <span>=</span>

            <div className="parallel-side parallel-values">
              {block.values.map((value, index) => (
                <div
                  className="parallel-item"
                  key={value.id}
                >
                  {renderExpressionSlot(
                    value,
                    `value ${index + 1}`,
                    "parallel-value-slot",
                    72,
                    170
                  )}

                  {block.targets.length > 1 && (
                    <button
                      className="remove-chain-button"
                      title="Remove this assignment pair"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeParallelPair(block.id, index);
                      }}
                    >
                      ×
                    </button>
                  )}

                  {index < block.values.length - 1 && (
                    <span>,</span>
                  )}
                </div>
              ))}
            </div>

            <button
              className="expand-expression-button"
              title="Add another variable and value"
              onClick={(event) => {
                event.stopPropagation();
                addParallelPair(block.id);
              }}
            >
              +
            </button>
          </div>
        )}

        {(block.type === "calculation" ||
          block.type === "calculationChain") && (
          <div className="block-row expression-enabled-row">
            {renderCalculationContent(block)}
          </div>
        )}

        {block.type === "logic" && (
          <div className="block-row expression-enabled-row">
            {renderLogicContent(block)}
          </div>
        )}

        {block.type === "comparisonChain" && (
          <div className="block-row expression-enabled-row">
            {renderComparisonChainContent(block)}
          </div>
        )}

        {(block.type === "array" || block.type === "set") && (
          <div className="block-row expression-enabled-row">
            {renderCollectionContent(block)}
          </div>
        )}

        {block.type === "dictionary" && (
          <div className="block-row expression-enabled-row">
            {renderDictionaryContent(block)}
          </div>
        )}




        {block.type === "print" && (
          <div className="block-row expression-enabled-row">
            <span>print</span>
            {renderExpressionSlot(
              block.value,
              "value",
              "wide-expression-slot",
              150,
              300
            )}
          </div>
        )}

        {block.type === "return" && (
          <div className="block-row expression-enabled-row">
            <span>return</span>
            {renderExpressionSlot(
              block.value,
              "value",
              "wide-expression-slot",
              150,
              300
            )}
          </div>
        )}

        {block.type === "call" && (
          <div className="block-row expression-enabled-row">
            {renderCallContent(block)}
          </div>
        )}

        {block.type === "if" && (
          <>
            <div className="block-row expression-enabled-row">
              <span>if</span>
              {renderExpressionSlot(
                block.condition,
                "condition",
                "condition-expression-slot",
                110,
                260,
                { showBadge: false, condition: true }
              )}
            </div>

            {renderNestedArea(
              block.children,
              "children",
              block.id,
              undefined,
              "Drop blocks for the if branch"
            )}

            {block.elifBranches.map((branch, index) => (
              <div className="conditional-branch" key={branch.id}>
                <div className="branch-header-row">
                  <span>elif</span>
                  {renderExpressionSlot(
                    branch.condition,
                    "condition",
                    "condition-expression-slot",
                    110,
                    260,
                    { showBadge: false, condition: true }
                  )}
                  <button
                    className="remove-branch-button"
                    title={`Remove elif ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeElifBranch(block.id, branch.id);
                    }}
                  >
                    ×
                  </button>
                </div>

                {renderNestedArea(
                  branch.children,
                  "elifChildren",
                  block.id,
                  branch.id,
                  `Drop blocks for elif ${index + 1}`
                )}
              </div>
            ))}

            {block.elseChildren !== null && (
              <div className="conditional-branch">
                <div className="branch-header-row">
                  <span>else</span>
                  <button
                    className="remove-branch-button"
                    title="Remove else branch"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeElseBranch(block.id);
                    }}
                  >
                    ×
                  </button>
                </div>

                {renderNestedArea(
                  block.elseChildren,
                  "elseChildren",
                  block.id,
                  undefined,
                  "Drop blocks for the else branch"
                )}
              </div>
            )}

            {block.elseChildren === null && (
              <div className="if-branch-controls">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    addElifBranch(block.id);
                  }}
                >
                  + elif
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    addElseBranch(block.id);
                  }}
                >
                  + else
                </button>
              </div>
            )}
          </>
        )}

        {block.type === "while" && (
          <>
            <div className="block-row expression-enabled-row">
              <span>while</span>
              {renderExpressionSlot(
                block.condition,
                "condition",
                "condition-expression-slot",
                110,
                260,
                { showBadge: false, condition: true }
              )}
            </div>
            {renderNestedArea(block.children, "children", block.id)}
          </>
        )}

        {block.type === "for" && (
          <>
            <div className="block-row expression-enabled-row">
              <span>for</span>
              <input
                placeholder="i"
                value={block.variable}
                style={{ width: getInputWidth(block.variable) }}
                onChange={(event) =>
                  updateBlockField(
                    block.id,
                    "variable",
                    sanitizeIdentifierInput(event.target.value)
                  )
                }
              />
              <span>from</span>
              {renderExpressionSlot(
                block.start,
                "0",
                "compact-expression-slot"
              )}
              <span>to</span>
              {renderExpressionSlot(
                block.end,
                "10",
                "compact-expression-slot"
              )}
            </div>
            {renderNestedArea(block.children, "children", block.id)}
          </>
        )}

        {block.type === "tryCatch" && (
          <>
            <div className="block-row">
              <span>try</span>
            </div>
            {renderNestedArea(
              block.tryChildren,
              "tryChildren",
              block.id
            )}

            <div className="catch-row">
              <span>catch</span>
              <input
                placeholder="error"
                value={block.catchErrorName}
                style={{
                  width: getInputWidth(block.catchErrorName),
                }}
                onChange={(event) =>
                  updateBlockField(
                    block.id,
                    "catchErrorName",
                    sanitizeIdentifierInput(event.target.value)
                  )
                }
              />
            </div>
            {renderNestedArea(
              block.catchChildren,
              "catchChildren",
              block.id
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="app" onClick={() => setOpenFunctionMenuId(null)}>
      <aside className="function-sidebar app-font">
        <div className="sidebar-header">
          <h1>Functions</h1>
          <span>Custom blocks</span>
        </div>

        <button className="create-function-button" onClick={createFunction}>
          + Create Function
        </button>

        {functions.length === 0 && (
          <p className="empty-function-message">
            Create a function to make your own reusable block.
          </p>
        )}

        {functions.map((func) => (
          <div
            key={func.id}
            className={`function-library-item ${
              openFunctionMenuId === func.id ? "menu-open" : ""
            }`}
          >
            <div
              className="template-block function-template function-library-block"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("source", "function");
                event.dataTransfer.setData("functionId", String(func.id));
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragEnd={handleDragEnd}
              onClick={() => addFunctionCall(func)}
            >
              <span className="function-block-name">{func.name}</span>

              <button
                className="function-more-button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenFunctionMenuId((previous) =>
                    previous === func.id ? null : func.id
                  );
                }}
                title="Function options"
              >
                ⋯
              </button>

              {openFunctionMenuId === func.id && (
                <div
                  className="function-menu"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      openFunctionTab(func.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 20H8L18.5 9.5L14.5 5.5L4 16V20Z" />
                      <path d="M13.5 6.5L17.5 10.5" />
                    </svg>
                    <span>Edit</span>
                  </button>

                  <button
                    className="danger-menu-item"
                    onClick={(event) => {
                      event.stopPropagation();
                      requestDeleteFunction(func.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 7H19" />
                      <path d="M10 11V17" />
                      <path d="M14 11V17" />
                      <path d="M8 7L9 4H15L16 7" />
                      <path d="M7 7L8 20H16L17 7" />
                    </svg>
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </aside>

      <aside className="block-menu app-font">
        <div className="sidebar-header">
          <h1>Blocks</h1>
          <span>Choose a category, then drag or click</span>
        </div>

        <div
          className="block-category-tabs"
          role="tablist"
          aria-label="Block categories"
        >
          {BLOCK_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={activeBlockCategory === category.id}
              className={`block-category-tab ${
                activeBlockCategory === category.id
                  ? "active-block-category-tab"
                  : ""
              }`}
              title={category.title}
              onClick={() => setActiveBlockCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="block-category-panel">
          {activeBlockCategory === "basics" && (
            <section className="block-section active-block-section">
              <div className="block-section-heading">
                <h3>Start Here</h3>
                <p>Create a value or show a result.</p>
              </div>
              {renderPaletteBlock("variable", "variable", "variable-template")}
              {renderPaletteBlock("print", "print", "print-template")}
            </section>
          )}

          {activeBlockCategory === "expressions" && (
            <section className="block-section active-block-section">
              <div className="block-section-heading">
                <h3>Expressions</h3>
                <p>Calculate values and build conditions.</p>
              </div>
              {renderPaletteBlock(
                "calculation",
                "calculation",
                "calculation-template"
              )}
              {renderPaletteBlock("logic", "logic", "logic-template")}
            </section>
          )}

          {activeBlockCategory === "data" && (
            <section className="block-section active-block-section">
              <div className="block-section-heading">
                <h3>Python Data</h3>
                <p>Build collections with expandable items.</p>
              </div>
              {renderPaletteBlock("array / list", "array", "array-template")}
              {renderPaletteBlock("set", "set", "set-template")}
              {renderPaletteBlock(
                "dictionary",
                "dictionary",
                "dictionary-template"
              )}
            </section>
          )}

          {activeBlockCategory === "flow" && (
            <section className="block-section active-block-section">
              <div className="block-section-heading">
                <h3>Control Flow</h3>
                <p>Choose paths and repeat blocks.</p>
              </div>
              {renderPaletteBlock("if", "if", "control-template")}
              {renderPaletteBlock("for", "for", "control-template")}
              {renderPaletteBlock("while", "while", "control-template")}
            </section>
          )}

          {activeBlockCategory === "more" && (
            <section className="block-section active-block-section">
              <div className="block-section-heading">
                <h3>More Blocks</h3>
                <p>Use these when your program needs them.</p>
              </div>
              {renderPaletteBlock("try/catch", "tryCatch", "try-template")}
              {renderPaletteBlock("return", "return", "return-template")}
            </section>
          )}
        </div>
      </aside>

      <main className="workspace-area">
        <div className="workspace-shell">
          <div className="workspace-tabs app-font">
            <button
              className={`workspace-tab ${
                editingFunction ? "" : "active-workspace-tab"
              }`}
              onClick={() => setEditingFunctionId(null)}
            >
              Main Workspace
            </button>

            {openFunctionTabIds.map((functionId) => {
              const func = functions.find((item) => item.id === functionId);
              if (!func) return null;

              return (
                <button
                  key={functionId}
                  className={`workspace-tab function-tab ${
                    editingFunctionId === functionId
                      ? "active-workspace-tab"
                      : ""
                  }`}
                  onClick={() => setEditingFunctionId(functionId)}
                >
                  <span>{func.name}</span>
                  <span
                    className="tab-close-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeFunctionTab(functionId);
                    }}
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </div>

          <div className="workspace-toolbar app-font">
            <div className="workspace-toolbar-left">
              <h2>
                {editingFunction
                  ? `Function: ${editingFunction.name}`
                  : "Workspace"}
              </h2>
              <p>
                {editingFunction
                  ? "Build this function, then switch back to the main workspace."
                  : "Drop statement blocks in the workspace and expression blocks inside value slots."}
              </p>

              {editingFunction && (
                <div className="function-editor-controls">
                  <div className="function-editor-row">
                    <label>name</label>
                    <input
                      placeholder="function name"
                      value={editingFunction.name}
                      onChange={(event) =>
                        updateFunctionName(editingFunction.id, event.target.value)
                      }
                    />
                  </div>

                  <div className="parameter-editor">
                    <div className="parameter-header">
                      <span>Parameters</span>
                      <button onClick={() => addParameter(editingFunction.id)}>
                        + Add Parameter
                      </button>
                    </div>

                    {editingFunction.params.length === 0 && (
                      <p className="parameter-empty">No parameters yet.</p>
                    )}

                    <div className="parameter-list">
                      {editingFunction.params.map((param, index) => (
                        <div key={index} className="parameter-item">
                          <input
                            placeholder={`param ${index + 1}`}
                            value={param}
                            onChange={(event) =>
                              updateParameter(
                                editingFunction.id,
                                index,
                                event.target.value
                              )
                            }
                          />
                          <button
                            onClick={() =>
                              deleteParameter(editingFunction.id, index)
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="zoom-controls">
              <button onClick={zoomOut}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn}>+</button>
              <button onClick={resetZoom}>Reset</button>
            </div>
          </div>

          <div
            key={editingFunction ? `function-${editingFunction.id}` : "main"}
            className="drop-zone workspace-mode-card"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) =>
              handleDrop(event, {
                area: "root",
                index: currentBlocks.length,
              })
            }
          >
            <div
              className="zoom-canvas"
              style={{ transform: `scale(${zoom})` }}
            >
              {renderBlockList(currentBlocks, "root")}
            </div>
          </div>
        </div>
      </main>

      <aside className="output-panel app-font">
        <div className="output-topbar">
          <div className="output-header">
            <h2>Output</h2>
            <span>Program result</span>
          </div>

          <button className="run-button" onClick={checkFlow}>
            <svg
              className="run-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <path d="M8 5V19L19 12L8 5Z" />
            </svg>
            <span>Run</span>
          </button>
        </div>

        {result && <pre className="result-message">{result}</pre>}

        <h3>JSON</h3>
        <pre>{JSON.stringify(programJson, null, 2)}</pre>
      </aside>

      {functionToDeleteId !== null && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <h2>Delete function?</h2>
            <p>
              This will remove the function and any blocks that call it. This
              action cannot be undone.
            </p>

            <div className="modal-actions">
              <button
                className="cancel-delete-button"
                onClick={cancelDeleteFunction}
              >
                Cancel
              </button>
              <button
                className="confirm-delete-button"
                onClick={confirmDeleteFunction}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
