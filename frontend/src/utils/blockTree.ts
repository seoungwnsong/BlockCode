import type {
  ArrayExpression,
  Block,
  BlockType,
  BuiltinCallExpression,
  BuiltinFunctionName,
  CalculationChainExpression,
  CalculationExpression,
  CallExpression,
  ComparisonChainExpression,
  ComparisonOperator,
  DictionaryExpression,
  Expression,
  ExpressionStatementBlock,
  JsonBlock,
  JsonCondition,
  JsonExpression,
  ListArea,
  ListDropTarget,
  LiteralExpression,
  LogicExpression,
  SetExpression,
  TupleExpression,
  UserFunction,
  VariableReferenceExpression,
} from "../types/blocks";
import { getBuiltinDefinition } from "../config/builtins";

export let idCounter = 0;

export function makeId() {
  idCounter += 1;
  return Date.now() * 1000 + idCounter;
}

export function decodeQuotedString(source: string, quote: "'" | '"') {
  const body = source.slice(1, -1);

  return body.replace(/\\([\\'"nrt])/g, (_, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    if (escaped === quote) return quote;
    return escaped;
  });
}

export function createAtomicExpression(source = "", id = makeId()): Expression {
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

export function createConditionExpression(
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

export function sanitizeIdentifierInput(value: string) {
  return value.replace(/\s+/g, "");
}

export function createCalculationExpression(id = makeId()): CalculationExpression {
  return {
    id,
    type: "calculation",
    left: createAtomicExpression(),
    operator: "+",
    right: createAtomicExpression(),
  };
}

export function createCalculationChainExpression(
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

export function createLogicExpression(id = makeId()): LogicExpression {
  return {
    id,
    type: "logic",
    left: createAtomicExpression(),
    operator: "==",
    right: createAtomicExpression(),
  };
}

export function createComparisonChainExpression(
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

export function createArrayExpression(id = makeId()): ArrayExpression {
  return {
    id,
    type: "array",
    items: [createAtomicExpression()],
  };
}

export function createSetExpression(id = makeId()): SetExpression {
  return {
    id,
    type: "set",
    items: [createAtomicExpression()],
  };
}

export function createTupleExpression(id = makeId()): TupleExpression {
  return {
    id,
    type: "tuple",
    items: [createAtomicExpression()],
  };
}

export function createDictionaryExpression(id = makeId()): DictionaryExpression {
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

export function createBuiltinCallExpression(
  name: BuiltinFunctionName,
  id = makeId()
): BuiltinCallExpression {
  const definition = getBuiltinDefinition(name);

  return {
    id,
    type: "builtinCall",
    name,
    argLabels: [...definition.argLabels],
    args: definition.argLabels.map(() => createAtomicExpression()),
  };
}

export function createCallExpression(func: UserFunction): CallExpression {
  return {
    id: makeId(),
    type: "call",
    functionId: func.id,
    name: func.name,
    paramNames: [...func.params],
    args: func.params.map(() => createAtomicExpression()),
  };
}

export function createBlock(type: BlockType): Block {
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

    case "tuple":
      return createTupleExpression(id);

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
        tryChildren: [],
        catches: [{ id: makeId(), errorType: "Exception", children: [] }],
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

export function isAtomicExpression(
  expression: Expression
): expression is LiteralExpression | VariableReferenceExpression {
  return (
    expression.type === "literal" ||
    expression.type === "variableReference"
  );
}

export function isExpressionStatement(
  expression: Expression
): expression is ExpressionStatementBlock {
  return (
    expression.type === "calculation" ||
    expression.type === "calculationChain" ||
    expression.type === "logic" ||
    expression.type === "comparisonChain" ||
    expression.type === "array" ||
    expression.type === "set" ||
    expression.type === "tuple" ||
    expression.type === "dictionary" ||
    expression.type === "builtinCall" ||
    expression.type === "call"
  );
}

export function isExpressionStatementBlock(
  block: Block
): block is ExpressionStatementBlock {
  return (
    block.type === "calculation" ||
    block.type === "calculationChain" ||
    block.type === "logic" ||
    block.type === "comparisonChain" ||
    block.type === "array" ||
    block.type === "set" ||
    block.type === "tuple" ||
    block.type === "dictionary" ||
    block.type === "builtinCall" ||
    block.type === "call"
  );
}

export function expressionContainsId(expression: Expression, id: number): boolean {
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

  if (expression.type === "array" || expression.type === "set" || expression.type === "tuple") {
    return expression.items.some((item) => expressionContainsId(item, id));
  }

  if (expression.type === "dictionary") {
    return expression.entries.some(
      (entry) =>
        expressionContainsId(entry.key, id) ||
        expressionContainsId(entry.value, id)
    );
  }




  if (
    expression.type === "call" ||
    expression.type === "builtinCall"
  ) {
    return expression.args.some((argument) =>
      expressionContainsId(argument, id)
    );
  }

  return false;
}

export function findExpressionById(
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

  if (expression.type === "array" || expression.type === "set" || expression.type === "tuple") {
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




  if (
    expression.type === "call" ||
    expression.type === "builtinCall"
  ) {
    for (const argument of expression.args) {
      const found = findExpressionById(argument, id);
      if (found) return found;
    }
  }

  return null;
}

export function updateExpressionById(
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

  if (expression.type === "array" || expression.type === "set" || expression.type === "tuple") {
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




  if (
    expression.type === "call" ||
    expression.type === "builtinCall"
  ) {
    return {
      ...expression,
      args: expression.args.map((argument) =>
        updateExpressionById(argument, id, updater)
      ),
    };
  }

  return expression;
}

export function findExpressionInBlock(block: Block, id: number): Expression | null {
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

    case "tryCatch": {
      const inTry = findExpressionInBlocks(block.tryChildren, id);
      if (inTry) return inTry;

      for (const branch of block.catches) {
        const inBranch = findExpressionInBlocks(branch.children, id);
        if (inBranch) return inBranch;
      }

      return null;
    }

    default:
      return null;
  }
}

export function findExpressionInBlocks(
  blocks: Block[],
  id: number
): Expression | null {
  for (const block of blocks) {
    const found = findExpressionInBlock(block, id);
    if (found) return found;
  }

  return null;
}

export function updateExpressionsInBlock(
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
        catches: block.catches.map((branch) => ({
          ...branch,
          children: updateExpressionsInBlocks(branch.children, id, updater),
        })),
      };
  }
}

export function updateExpressionsInBlocks(
  blocks: Block[],
  id: number,
  updater: (current: Expression) => Expression
): Block[] {
  return blocks.map((block) => updateExpressionsInBlock(block, id, updater));
}

export function blockContainsExpressionId(block: Block, id: number): boolean {
  return findExpressionInBlock(block, id) !== null;
}

export function blockContainsBlockId(block: Block, id: number): boolean {
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
      block.catches.some((branch) =>
        branch.children.some((child) => blockContainsBlockId(child, id))
      )
    );
  }

  return false;
}

export function insertIntoBlocks(
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
        return {
          ...block,
          catches: block.catches.map((branch) => {
            if (branch.id !== target.branchId) return branch;
            const children = [...branch.children];
            children.splice(target.index, 0, newBlock);
            return { ...branch, children };
          }),
        };
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
        catches: block.catches.map((branch) => ({
          ...branch,
          children: insertIntoBlocks(branch.children, target, newBlock),
        })),
      };
    }

    return block;
  });
}

export function removeBlockById(
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
        if (tryResult.removedBlock) removedBlock = tryResult.removedBlock;

        const catches = block.catches.map((branch) => {
          const result = removeBlockById(branch.children, id);
          if (result.removedBlock) removedBlock = result.removedBlock;
          return { ...branch, children: result.updatedBlocks };
        });

        return {
          ...block,
          tryChildren: tryResult.updatedBlocks,
          catches,
        };
      }

      return block;
    })
    .filter((block): block is Block => block !== null);

  return { updatedBlocks, removedBlock };
}

export function findBlockById(blockList: Block[], id: number): Block | null {
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

      for (const branch of block.catches) {
        const inBranch = findBlockById(branch.children, id);
        if (inBranch) return inBranch;
      }
    }
  }

  return null;
}

export function findBlockLocation(
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
      if (area === "elifChildren" || area === "catchChildren") {
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

      for (const branch of block.catches) {
        const inBranch = findBlockLocation(
          branch.children,
          id,
          "catchChildren",
          block.id,
          branch.id
        );
        if (inBranch) return inBranch;
      }
    }
  }

  return null;
}

export function isSameListTarget(
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

  if (source.area === "catchChildren" && target.area === "catchChildren") {
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

export function adjustTargetAfterRemoval(
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

export function syncExpressionFunctionCalls(
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

  if (expression.type === "array" || expression.type === "set" || expression.type === "tuple") {
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




  if (expression.type === "builtinCall") {
    return {
      ...expression,
      args: expression.args.map((argument) =>
        syncExpressionFunctionCalls(
          argument,
          functionId,
          nextName,
          nextParams
        )
      ),
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

export function syncFunctionCalls(
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
          catches: block.catches.map((branch) => ({
            ...branch,
            children: syncFunctionCalls(
              branch.children,
              functionId,
              nextName,
              nextParams
            ),
          })),
        };
    }
  });
}

export function removeFunctionCallsFromExpression(
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

  if (expression.type === "array" || expression.type === "set" || expression.type === "tuple") {
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




  if (
    expression.type === "call" ||
    expression.type === "builtinCall"
  ) {
    return {
      ...expression,
      args: expression.args.map((argument) =>
        removeFunctionCallsFromExpression(argument, functionId)
      ),
    };
  }

  return expression;
}

export function removeFunctionCalls(
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
            catches: block.catches.map((branch) => ({
              ...branch,
              children: removeFunctionCalls(branch.children, functionId),
            })),
          };
      }
    });
}

export function serializeExpression(expression: Expression): JsonExpression {
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

    case "tuple":
      return {
        id: expression.id,
        type: "tuple",
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

    case "builtinCall":
      return {
        id: expression.id,
        type: "builtinCall",
        name: expression.name,
        args: expression.args.map(serializeExpression),
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

export function serializeCondition(condition: Expression): JsonCondition {
  if (isAtomicExpression(condition)) return condition.source.trim();
  return serializeExpression(condition);
}

export function serializeBlock(block: Block): JsonBlock {
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
          | "builtinCall"
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
        tryChildren: block.tryChildren.map(serializeBlock),
        catches: block.catches.map((branch) => ({
          id: branch.id,
          errorType: branch.errorType,
          children: branch.children.map(serializeBlock),
        })),
      };
  }
}
export function collectConditionErrors(
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

export function collectExpressionErrors(
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

  if (expression.type === "array" || expression.type === "set" || expression.type === "tuple") {
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

export function collectBlockErrors(
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
      block.tryChildren.forEach((child, index) =>
        collectBlockErrors(
          child,
          `${location}.tryChildren[${index}]`,
          errors
        )
      );
      block.catches.forEach((branch, branchIndex) => {
        branch.children.forEach((child, childIndex) =>
          collectBlockErrors(
            child,
            `${location}.catches[${branchIndex}].children[${childIndex}]`,
            errors
          )
        );
      });
  }
}
