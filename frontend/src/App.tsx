import { useState } from "react";
import type { DragEvent } from "react";
import "./App.css";
import blockCodeLogo from "./assets/blockcode-logo.png";
import { ToolboxAccordion } from "./components/toolbox/ToolboxAccordion";
import type { ToolboxCategory } from "./components/toolbox/ToolboxAccordion";
import type {
  ArrayExpression,
  Block,
  BlockType,
  BuiltinCallExpression,
  BuiltinDefinition,
  BuiltinFunctionName,
  BuiltinGroupId,
  CalculationChainExpression,
  CalculationExpression,
  CallExpression,
  CatchBranch,
  ComparisonChainExpression,
  ComparisonOperator,
  DictionaryExpression,
  DropTarget,
  Expression,
  ExpressionDropTarget,
  ExpressionStatementBlock,
  ListArea,
  ListDropTarget,
  LogicExpression,
  LogicOperator,
  MathOperator,
  PythonErrorType,
  SetExpression,
  UserFunction,
} from "./types/blocks";
import {
  ERROR_TYPES,
  BUILTIN_GROUPS,
  METHOD_GROUPS,
  getBuiltinGroupId,
  isVariadicBuiltin,
  getBuiltinMinimumArgs,
  getBuiltinArgumentLabel,
} from "./config/builtins";
import {
  makeId,
  createAtomicExpression,
  createConditionExpression,
  sanitizeIdentifierInput,
  createCalculationChainExpression,
  createComparisonChainExpression,
  createBuiltinCallExpression,
  createCallExpression,
  createBlock,
  isAtomicExpression,
  isExpressionStatement,
  isExpressionStatementBlock,
  expressionContainsId,
  findExpressionInBlocks,
  updateExpressionsInBlocks,
  blockContainsExpressionId,
  blockContainsBlockId,
  insertIntoBlocks,
  removeBlockById,
  findBlockById,
  adjustTargetAfterRemoval,
  syncFunctionCalls,
  removeFunctionCalls,
  serializeBlock,
  collectBlockErrors,
} from "./utils/blockTree";
import { buildPythonSource } from "./utils/pythonPreview";

function App() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [result, setResult] = useState("");
  const [zoom, setZoom] = useState(0.8);
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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
            catches: block.catches.map((branch) => ({
              ...branch,
              children: update(branch.children),
            })),
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

  function addBuiltinArgument(id: number) {
    updateCurrentExpression(id, (expression) => {
      if (
        expression.type !== "builtinCall" ||
        !isVariadicBuiltin(expression.name)
      ) {
        return expression;
      }

      const nextArgs = [
        ...expression.args,
        createAtomicExpression(),
      ];

      return {
        ...expression,
        args: nextArgs,
        argLabels: nextArgs.map((_, index) =>
          getBuiltinArgumentLabel(expression.name, index)
        ),
      };
    });
  }

  function removeBuiltinArgument(id: number, index: number) {
    updateCurrentExpression(id, (expression) => {
      if (
        expression.type !== "builtinCall" ||
        !isVariadicBuiltin(expression.name)
      ) {
        return expression;
      }

      const minimumArgs = getBuiltinMinimumArgs(expression.name);

      if (expression.args.length <= minimumArgs) {
        return expression;
      }

      const nextArgs = expression.args.filter(
        (_, argumentIndex) => argumentIndex !== index
      );

      return {
        ...expression,
        args: nextArgs,
        argLabels: nextArgs.map((_, argumentIndex) =>
          getBuiltinArgumentLabel(
            expression.name,
            argumentIndex
          )
        ),
      };
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

  function addCatchBranch(blockId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "tryCatch") return block;

      const newBranch: CatchBranch = {
        id: makeId(),
        errorType: "TypeError",
        children: [],
      };

      // Exception matches anything, so it must stay the last branch — a new
      // branch always lands ahead of a trailing Exception, never after it.
      const lastIndex = block.catches.length - 1;
      const lastIsException =
        lastIndex >= 0 && block.catches[lastIndex].errorType === "Exception";

      const catches = lastIsException
        ? [
            ...block.catches.slice(0, lastIndex),
            newBranch,
            block.catches[lastIndex],
          ]
        : [...block.catches, newBranch];

      return { ...block, catches };
    });
  }

  function removeCatchBranch(blockId: number, branchId: number) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "tryCatch" || block.catches.length <= 1) {
        return block;
      }
      return {
        ...block,
        catches: block.catches.filter((branch) => branch.id !== branchId),
      };
    });
  }

  function updateCatchErrorType(
    blockId: number,
    branchId: number,
    errorType: PythonErrorType
  ) {
    updateBlockById(blockId, (block) => {
      if (block.type !== "tryCatch") return block;

      const updated = block.catches.map((branch) =>
        branch.id === branchId ? { ...branch, errorType } : branch
      );

      if (errorType !== "Exception") return { ...block, catches: updated };

      // Exception must stay last — move the branch that just became
      // Exception to the end instead of leaving it mid-chain, unreachable.
      const target = updated.find((branch) => branch.id === branchId);
      if (!target) return { ...block, catches: updated };

      const rest = updated.filter((branch) => branch.id !== branchId);
      return { ...block, catches: [...rest, target] };
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
    if (target.area === "elifChildren" || target.area === "catchChildren") {
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

  function handleBuiltinDragStart(
    event: DragEvent<HTMLDivElement>,
    name: BuiltinFunctionName
  ) {
    event.dataTransfer.setData("source", "builtin");
    event.dataTransfer.setData("builtinName", name);
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

    if (source === "builtin") {
      const builtinName = event.dataTransfer.getData(
        "builtinName"
      ) as BuiltinFunctionName;

      if (builtinName) {
        const call = createBuiltinCallExpression(builtinName);

        if (finalTarget.area === "expression") {
          replaceCurrentExpression(finalTarget.expressionId, call);
        } else {
          setCurrentBlocks((previous) =>
            insertIntoBlocks(previous, finalTarget, call)
          );
        }
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

  function addBuiltinCall(name: BuiltinFunctionName) {
    setCurrentBlocks((previous) => [
      ...previous,
      createBuiltinCallExpression(name),
    ]);
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
    setZoom(0.8);
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

      // A block that failed while running is reported per-block in `results`
      // (the server still answers 200 with status "done"). Python stops at the
      // first error, so runProgram records one error entry and halts — surface
      // it here instead of letting the run look like it finished silently.
      type RunResult = {
        status?: string;
        errorType?: string;
        message?: string;
      };
      const runErrors = (Array.isArray(data.results) ? data.results : []).filter(
        (entry: RunResult) => entry && entry.status === "error"
      );

      if (runErrors.length > 0) {
        // Keep any output printed before the failure, then the error line(s),
        // the way a Python traceback follows whatever was already printed.
        const priorOutput = Array.isArray(data.output) ? data.output : [];
        const errorLines = runErrors.map(
          (entry: RunResult) =>
            `${entry.errorType || "Error"}: ${entry.message || "Program could not run."}`
        );
        setResult([...priorOutput, ...errorLines].join("\n"));
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

  function renderBuiltinBlock(
    definition: BuiltinDefinition,
    groupId: BuiltinGroupId
  ) {
    const shortName = definition.name.includes(".")
      ? definition.name.split(".")[1]
      : definition.name;

    return (
      <div
        key={definition.name}
        className={`template-block builtin-template builtin-template-${groupId}`}
        draggable
        onDragStart={(event) =>
          handleBuiltinDragStart(event, definition.name)
        }
        onDragEnd={handleDragEnd}
        onClick={() => addBuiltinCall(definition.name)}
        title={`${definition.name}(${definition.argLabels.join(", ")})`}
      >
        <span className="builtin-template-name">{shortName}</span>
        <span className="builtin-template-parentheses">()</span>
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
        <option value="is">is</option>
        <option value="is not">is not</option>
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

  function renderBuiltinCallContent(expression: BuiltinCallExpression) {
    const isVariadic = isVariadicBuiltin(expression.name);
    const minimumArgs = getBuiltinMinimumArgs(expression.name);
    const canRemoveArgument =
      isVariadic && expression.args.length > minimumArgs;

    return (
      <div className="expression-content-row function-call-row builtin-call-row">
        <span className="function-call-name builtin-call-name">
          {expression.name}
        </span>
        <span>(</span>

        {expression.args.map((argument, index) => (
          <div
            key={argument.id}
            className="function-argument-item builtin-argument-item"
          >
            {renderExpressionSlot(
              argument,
              expression.argLabels[index] ||
                getBuiltinArgumentLabel(expression.name, index),
              "function-argument-slot",
              78,
              170
            )}

            {canRemoveArgument && (
              <button
                type="button"
                className="remove-builtin-argument-button"
                title={`Remove argument ${index + 1}`}
                aria-label={`Remove argument ${index + 1}`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  removeBuiltinArgument(expression.id, index);
                }}
              >
                ×
              </button>
            )}

            {index < expression.args.length - 1 && <span>,</span>}
          </div>
        ))}

        <span>)</span>

        {isVariadic && (
          <button
            type="button"
            className="add-builtin-argument-button"
            title={`Add another value to ${expression.name}()`}
            aria-label={`Add another value to ${expression.name}()`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              addBuiltinArgument(expression.id);
            }}
          >
            +
          </button>
        )}
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
            : expression.type === "builtinCall"
              ? "builtin-call-expression"
              : "call-expression";

    return (
      <div
        className={`nested-expression ${expressionClass} ${
          expression.type === "builtinCall"
            ? `builtin-call-${getBuiltinGroupId(expression.name)}`
            : ""
        }`}
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
        {expression.type === "builtinCall" &&
          renderBuiltinCallContent(expression)}
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
        } ${
          block.type === "builtinCall"
            ? `builtin-call-${getBuiltinGroupId(block.name)}`
            : ""
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

        {block.type === "builtinCall" && (
          <div className="block-row expression-enabled-row">
            {renderBuiltinCallContent(block)}
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
              block.id,
              undefined,
              "Drop blocks for the try body"
            )}

            {block.catches.map((branch, index) => (
              <div className="conditional-branch" key={branch.id}>
                <div className="branch-header-row catch-header-row">
                  <span>catch</span>
                  <select
                    value={branch.errorType}
                    onChange={(event) =>
                      updateCatchErrorType(
                        block.id,
                        branch.id,
                        event.target.value as PythonErrorType
                      )
                    }
                  >
                    {ERROR_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value}
                      </option>
                    ))}
                  </select>

                  {block.catches.length > 1 && (
                    <button
                      className="remove-branch-button"
                      title={`Remove catch ${index + 1}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeCatchBranch(block.id, branch.id);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {renderNestedArea(
                  branch.children,
                  "catchChildren",
                  block.id,
                  branch.id,
                  `Drop blocks for catch ${index + 1}`
                )}
              </div>
            ))}

            <div className="if-branch-controls">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  addCatchBranch(block.id);
                }}
              >
                + catch
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const toolboxCategories: ToolboxCategory[] = [
    {
      id: "basics",
      label: "Basic",
      color: "var(--blue-block)",
      layout: "stack",
      content: (
        <>
          {renderPaletteBlock("variable", "variable", "variable-template")}
          {renderPaletteBlock("print", "print", "print-template")}
          {renderPaletteBlock("return", "return", "return-template")}
        </>
      ),
    },
    {
      id: "expressions",
      label: "Expressions",
      color: "var(--purple-block)",
      layout: "stack",
      content: (
        <>
          {renderPaletteBlock("calculation", "calculation", "calculation-template")}
          {renderPaletteBlock("logic", "logic", "logic-template")}
        </>
      ),
    },
    {
      id: "data",
      label: "Data Structures",
      color: "var(--mint-block)",
      layout: "stack",
      content: (
        <>
          {renderPaletteBlock("array / list", "array", "array-template")}
          {renderPaletteBlock("set", "set", "set-template")}
          {renderPaletteBlock("dictionary", "dictionary", "dictionary-template")}
        </>
      ),
    },
    {
      id: "flow",
      label: "Flow Controls",
      color: "var(--yellow-block)",
      layout: "stack",
      content: (
        <>
          {renderPaletteBlock("if", "if", "control-template")}
          {renderPaletteBlock("try/catch", "tryCatch", "try-template")}
          {renderPaletteBlock("for", "for", "control-template")}
          {renderPaletteBlock("while", "while", "control-template")}
        </>
      ),
    },
    {
      id: "functions",
      label: "Functions",
      color: "#d8b4fe",
      layout: "stack",
      content: (
        <>
          <button className="create-function-button" onClick={createFunction}>
            + Create Function
          </button>

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
        </>
      ),
    },
    {
      id: "builtins",
      label: "Built-ins",
      color: "var(--brand-blue)",
      layout: "stack",
      content: (
        <>
          {BUILTIN_GROUPS.map((group) => (
            <section
              className={`builtin-group builtin-group-${group.id}`}
              key={group.id}
            >
              <h2>{group.title}</h2>
              <div className="builtin-list">
                {group.functions.map((definition) =>
                  renderBuiltinBlock(definition, group.id)
                )}
              </div>
            </section>
          ))}
        </>
      ),
    },
    ...METHOD_GROUPS.map((group) => ({
      id: group.id,
      label: `${group.title} Methods`,
      color: `var(--brand-${
        group.id === "list"
          ? "peach"
          : group.id === "string"
            ? "green"
            : group.id === "dict"
              ? "lavender"
              : "teal"
      })`,
      layout: "grid" as const,
      content: (
        <>
          {group.functions.map((definition) =>
            renderBuiltinBlock(definition, group.id)
          )}
        </>
      ),
    })),
  ];

  return (
    <div className="app" onClick={() => setOpenFunctionMenuId(null)}>
      <header className="app-topbar app-font">
        <div className="topbar-brand">
          <img
            src={blockCodeLogo}
            alt="BlockCode"
            className="topbar-logo"
          />
        </div>

        <div className="topbar-actions">
          <button
            className="run-button"
            onClick={checkFlow}
            title="Run program"
            aria-label="Run program"
          >
            <svg
              className="run-icon"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path d="M8 5V19L19 12L8 5Z" />
            </svg>
          </button>
        </div>
      </header>

      <ToolboxAccordion
        categories={toolboxCategories}
        activeCategory={activeCategory}
        onToggleCategory={(id) =>
          setActiveCategory((previous) => (previous === id ? null : id))
        }
      />

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
          </div>
        </div>

        {result && <pre className="result-message">{result}</pre>}

        <h3>Python Preview</h3>
        <pre className="python-code-preview">{buildPythonSource(functions, blocks)}</pre>
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

