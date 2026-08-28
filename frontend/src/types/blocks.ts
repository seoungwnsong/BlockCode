export type DataType = "int" | "float" | "bool" | "string";
export type MathOperator = "+" | "-" | "*" | "/" | "%";
export type ComparisonOperator =
  | "=="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "is"
  | "is not";
export type LogicOperator = ComparisonOperator | "and" | "or";

export type LiteralExpression = {
  id: number;
  type: "literal";
  dataType: DataType;
  value: string | number | boolean;
  source: string;
  valid: boolean;
  error?: string;
};

export type VariableReferenceExpression = {
  id: number;
  type: "variableReference";
  name: string;
  source: string;
  valid: true;
};

export type CalculationExpression = {
  id: number;
  type: "calculation";
  left: Expression;
  operator: MathOperator;
  right: Expression;
};

export type CalculationChainExpression = {
  id: number;
  type: "calculationChain";
  first: Expression;
  operations: {
    operator: MathOperator;
    value: Expression;
  }[];
};

export type LogicExpression = {
  id: number;
  type: "logic";
  left: Expression;
  operator: LogicOperator;
  right: Expression;
};

export type ComparisonChainExpression = {
  id: number;
  type: "comparisonChain";
  first: Expression;
  comparisons: {
    operator: ComparisonOperator;
    right: Expression;
  }[];
};

export type ArrayExpression = {
  id: number;
  type: "array";
  items: Expression[];
};

export type SetExpression = {
  id: number;
  type: "set";
  items: Expression[];
};

export type DictionaryEntry = {
  id: number;
  key: Expression;
  value: Expression;
};

export type DictionaryExpression = {
  id: number;
  type: "dictionary";
  entries: DictionaryEntry[];
};


export type BuiltinFunctionName =
  | "len"
  | "type"
  | "id"
  | "int"
  | "float"
  | "str"
  | "bool"
  | "list"
  | "tuple"
  | "set"
  | "dict"
  | "abs"
  | "round"
  | "min"
  | "max"
  | "sum"
  | "sorted"
  | "reversed"
  | "all"
  | "any"
  | "list.append"
  | "list.pop"
  | "list.insert"
  | "list.remove"
  | "list.extend"
  | "list.index"
  | "list.count"
  | "list.sort"
  | "list.reverse"
  | "string.upper"
  | "string.lower"
  | "string.strip"
  | "string.split"
  | "string.join"
  | "string.replace"
  | "string.find"
  | "dict.keys"
  | "dict.values"
  | "dict.items"
  | "dict.get"
  | "dict.update"
  | "dict.pop"
  | "set.add"
  | "set.remove"
  | "set.discard"
  | "set.union"
  | "set.intersection"
  | "set.difference";

export type BuiltinGroupId =
  | "general"
  | "convert"
  | "numbers"
  | "collections"
  | "list"
  | "string"
  | "dict"
  | "set";

export type BuiltinCallExpression = {
  id: number;
  type: "builtinCall";
  name: BuiltinFunctionName;
  argLabels: string[];
  args: Expression[];
};

export type CallExpression = {
  id: number;
  type: "call";
  functionId: number;
  name: string;
  paramNames: string[];
  args: Expression[];
};

export type Expression =
  | LiteralExpression
  | VariableReferenceExpression
  | CalculationExpression
  | CalculationChainExpression
  | LogicExpression
  | ComparisonChainExpression
  | ArrayExpression
  | SetExpression
  | DictionaryExpression
  | BuiltinCallExpression
  | CallExpression;

export type ExpressionStatementBlock =
  | CalculationExpression
  | CalculationChainExpression
  | LogicExpression
  | ComparisonChainExpression
  | ArrayExpression
  | SetExpression
  | DictionaryExpression
  | BuiltinCallExpression
  | CallExpression;

export type ElifBranch = {
  id: number;
  condition: Expression;
  children: Block[];
};

export type IfBlock = {
  id: number;
  type: "if";
  condition: Expression;
  children: Block[];
  elifBranches: ElifBranch[];
  elseChildren: Block[] | null;
};

export type PythonErrorType =
  | "Exception"
  | "TypeError"
  | "ValueError"
  | "NameError"
  | "ZeroDivisionError"
  | "IndexError"
  | "KeyError"
  | "AttributeError"
  | "FileNotFoundError"
  | "AssertionError";

export type CatchBranch = {
  id: number;
  errorType: PythonErrorType;
  children: Block[];
};

export type TryCatchBlock = {
  id: number;
  type: "tryCatch";
  tryChildren: Block[];
  catches: CatchBranch[];
};

export type ParallelAssignmentBlock = {
  id: number;
  type: "parallelAssign";
  targets: string[];
  values: Expression[];
};

export type VariableBlock = {
  id: number;
  type: "variable";
  name: string;
  value: Expression;
};

export type PrintBlock = {
  id: number;
  type: "print";
  value: Expression;
};

export type ReturnBlock = {
  id: number;
  type: "return";
  value: Expression;
};

export type WhileBlock = {
  id: number;
  type: "while";
  condition: Expression;
  children: Block[];
};

export type ForBlock = {
  id: number;
  type: "for";
  variable: string;
  start: Expression;
  end: Expression;
  children: Block[];
};

export type Block =
  | VariableBlock
  | ParallelAssignmentBlock
  | ExpressionStatementBlock
  | PrintBlock
  | ReturnBlock
  | IfBlock
  | WhileBlock
  | ForBlock
  | TryCatchBlock;

export type UserFunction = {
  id: number;
  name: string;
  params: string[];
  children: Block[];
};

export type BlockType = Exclude<Block["type"], "builtinCall">;

export type BuiltinDefinition = {
  name: BuiltinFunctionName;
  argLabels: string[];
  variadic?: boolean;
  minimumArgs?: number;
};

export type BuiltinGroup = {
  id: BuiltinGroupId;
  title: string;
  functions: BuiltinDefinition[];
};


export type ListDropTarget =
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
      branchId: number;
      index: number;
    };

export type ExpressionDropTarget = {
  area: "expression";
  expressionId: number;
};

export type DropTarget = ListDropTarget | ExpressionDropTarget;
export type ListArea = ListDropTarget["area"];

export type JsonExpression =
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
      type: "builtinCall";
      name: BuiltinFunctionName;
      args: JsonExpression[];
    }
  | {
      id: number;
      type: "call";
      functionId: number;
      name: string;
      paramNames: string[];
      args: JsonExpression[];
    };

export type JsonCondition = string | JsonExpression;

export type JsonElifBranch = {
  id: number;
  condition: JsonCondition;
  children: JsonBlock[];
};

export type JsonCatchBranch = {
  id: number;
  errorType: PythonErrorType;
  children: JsonBlock[];
};

export type JsonBlock =
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
          | "builtinCall"
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
      tryChildren: JsonBlock[];
      catches: JsonCatchBranch[];
    };
