import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import "./App.css";
import blockCodeLogo from "./assets/blockcode-logo.png";
import { ToolboxAccordion } from "./components/toolbox/ToolboxAccordion";
import type { ToolboxCategory } from "./components/toolbox/ToolboxAccordion";
import {
  ParallelAssignBlockView,
  PrintBlockView,
  ReturnBlockView,
  VariableBlockView,
} from "./components/blocks/SimpleBlockViews";
import {
  ForBlockView,
  IfBlockView,
  TryCatchBlockView,
  WhileBlockView,
} from "./components/blocks/ControlFlowBlockViews";
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
  IndexExpression,
  ListArea,
  ListDropTarget,
  LogicExpression,
  LogicOperator,
  MathOperator,
  PythonErrorType,
  SetExpression,
  SetItemBlock,
  SliceExpression,
  TupleExpression,
  UserFunction,
} from "./types/blocks";
import {
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
  insertManyIntoBlocks,
  removeBlockById,
  removeBlocksByIds,
  findBlockById,
  adjustTargetAfterRemoval,
  adjustTargetAfterGroupRemoval,
  syncFunctionCalls,
  removeFunctionCalls,
  serializeBlock,
  collectBlockErrors,
  cloneBlock,
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

  // Multi-select: selectedBlockIds always holds ids from the TOP LEVEL of
  // currentBlocks only (never nested children) — see renderBlockList, which
  // only marks the root pass as selectable. Purely editor/UI state: never
  // serialized, never affects program semantics.
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<number>>(
    new Set()
  );
  const [copiedBlocks, setCopiedBlocks] = useState<Block[]>([]);
  const [marqueeBox, setMarqueeBox] = useState<CSSProperties | null>(null);
  const [toolbarStyle, setToolbarStyle] = useState<CSSProperties | undefined>(
    undefined
  );
  // At most one contextual Paste popup at a time: its screen position
  // (container-relative, already clamped inside the workspace) plus the
  // root-level index a paste from it should insert at.
  const [contextualPaste, setContextualPaste] = useState<{
    style: CSSProperties;
    insertionIndex: number;
  } | null>(null);

  const workspaceContainerRef = useRef<HTMLDivElement | null>(null);
  const blockElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Marquee dragging uses Pointer Events + setPointerCapture (see
  // handleWorkspacePointerDown) rather than window-level mouse listeners, so
  // pointermove/pointerup are plain JSX handlers that always close over the
  // current render's state directly — no ref-mirroring needed for that part.
  // This ref only tracks the in-progress gesture itself.
  const marqueeDragRef = useRef<{
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number;
  } | null>(null);

  const editingFunction =
    editingFunctionId === null
      ? null
      : functions.find((func) => func.id === editingFunctionId) ?? null;

  const currentBlocks = editingFunction ? editingFunction.children : blocks;

  // Selection refers to ids in whichever workspace is currently open — reset
  // it during render when the tab changes, rather than in an effect, so it
  // never briefly points at blocks from a different list after a switch.
  const [selectionResetKey, setSelectionResetKey] = useState(editingFunctionId);
  if (selectionResetKey !== editingFunctionId) {
    setSelectionResetKey(editingFunctionId);
    setSelectedBlockIds(new Set());
    setMarqueeBox(null);
    setContextualPaste(null);
  }

  function isEditableEventTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  // Element, not HTMLElement: an SVG icon inside a toolbar/block button is an
  // SVGElement, and `instanceof HTMLElement` is false for those. Using the
  // instanceof HTMLElement check here let pointerdown-on-icon fall through as
  // "not interactive", which is what silently broke the Copy/Delete buttons —
  // the workspace read the gesture as an empty-space click and cleared the
  // selection out from under the button's own click handler.
  function isInteractiveOrBlockTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'input, textarea, select, button, [contenteditable="true"], .scratch-block, .selection-toolbar, .contextual-paste-popup'
      )
    );
  }

  function hasActiveTextSelection() {
    const selection = window.getSelection();
    return !!selection && selection.toString().length > 0;
  }

  function toggleBlockSelection(id: number) {
    setSelectedBlockIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedBlockIds(new Set());
  }

  function handleBlockClick(
    event: ReactMouseEvent<HTMLDivElement>,
    blockId: number
  ) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('input, textarea, select, button, [contenteditable="true"]')
    ) {
      return;
    }
    event.stopPropagation();
    toggleBlockSelection(blockId);
  }

  // A mousedown/pointerdown landing on the container's own scrollbar has the
  // container itself as event.target (same as clicking empty canvas), so it
  // can't be excluded by a target/closest check — this measures the actual
  // scrollbar thickness (offsetWidth/Height vs clientWidth/Height) and treats
  // a press within that strip as "not empty workspace".
  function isOnWorkspaceScrollbar(
    event: { clientX: number; clientY: number },
    container: HTMLDivElement
  ) {
    const rect = container.getBoundingClientRect();
    const scrollbarWidth = container.offsetWidth - container.clientWidth;
    const scrollbarHeight = container.offsetHeight - container.clientHeight;
    const onVerticalScrollbar =
      scrollbarWidth > 0 && event.clientX >= rect.right - scrollbarWidth;
    const onHorizontalScrollbar =
      scrollbarHeight > 0 && event.clientY >= rect.bottom - scrollbarHeight;
    return onVerticalScrollbar || onHorizontalScrollbar;
  }

  function clampToWorkspace(clientX: number, clientY: number, rect: DOMRect) {
    return {
      x: Math.min(Math.max(clientX, rect.left), rect.right),
      y: Math.min(Math.max(clientY, rect.top), rect.bottom),
    };
  }

  function computeMarqueeGeometry(
    dragState: { startX: number; startY: number },
    clampedX: number,
    clampedY: number,
    containerRect: DOMRect,
    container: HTMLDivElement
  ) {
    const left = Math.min(dragState.startX, clampedX);
    const right = Math.max(dragState.startX, clampedX);
    const top = Math.min(dragState.startY, clampedY);
    const bottom = Math.max(dragState.startY, clampedY);

    return {
      left,
      right,
      top,
      bottom,
      style: {
        left: left - containerRect.left + container.scrollLeft,
        top: top - containerRect.top + container.scrollTop,
        width: right - left,
        height: bottom - top,
      } satisfies CSSProperties,
    };
  }

  // pointerdown/pointermove/pointerup (with setPointerCapture) replace plain
  // mouse events here so the gesture keeps receiving updates even if the
  // pointer momentarily leaves the workspace element or the window — capture
  // re-targets those events back to the container instead of losing them.
  // This never engages for an actual block/expression drag: draggable="true"
  // elements use the separate native HTML5 DnD pipeline, and this handler
  // bails out before capturing whenever the press starts on a block or any
  // interactive control.
  // Root-level index a paste at this Y position should land at, using the
  // exact same midpoint-comparison rule getBlockHoverTarget already uses for
  // ordinary drag-and-drop hover targets — just applied directly to a click
  // point instead of a specific hovered block-wrapper element.
  function computeRootInsertionIndexFromY(clientY: number) {
    for (let index = 0; index < currentBlocks.length; index += 1) {
      const element = blockElementRefs.current.get(currentBlocks[index].id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
    }
    return currentBlocks.length;
  }

  function showContextualPaste(
    clientX: number,
    clientY: number,
    container: HTMLDivElement
  ) {
    const containerRect = container.getBoundingClientRect();
    const { x: clampedX, y: clampedY } = clampToWorkspace(
      clientX,
      clientY,
      containerRect
    );
    const insertionIndex = computeRootInsertionIndexFromY(clampedY);

    const POPUP_WIDTH = 100;
    const POPUP_HEIGHT = 36;
    const maxLeft = container.scrollLeft + container.clientWidth - POPUP_WIDTH - 4;
    const maxTop = container.scrollTop + container.clientHeight - POPUP_HEIGHT - 4;

    const left = Math.max(
      Math.min(clampedX - containerRect.left + container.scrollLeft, maxLeft),
      container.scrollLeft + 4
    );
    const top = Math.max(
      Math.min(clampedY - containerRect.top + container.scrollTop, maxTop),
      container.scrollTop + 4
    );

    setContextualPaste({ style: { left, top }, insertionIndex });
  }

  function handleWorkspacePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Any new press anywhere in the workspace invalidates a stale popup —
    // covers "click elsewhere", "start marquee", and "start a block drag"
    // (block drag's own pointerdown bubbles here before dragstart fires) in
    // one place, since all of those are pointerdown gestures on or within
    // this container.
    setContextualPaste(null);

    if (event.button !== 0) return;
    if (isInteractiveOrBlockTarget(event.target)) return;

    const container = event.currentTarget;
    if (isOnWorkspaceScrollbar(event, container)) return;

    event.preventDefault();
    container.setPointerCapture(event.pointerId);
    marqueeDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      pointerId: event.pointerId,
    };
  }

  function handleWorkspacePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = marqueeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const container = event.currentTarget;
    const containerRect = container.getBoundingClientRect();
    const { x: clampedX, y: clampedY } = clampToWorkspace(
      event.clientX,
      event.clientY,
      containerRect
    );

    if (!dragState.active) {
      const dx = clampedX - dragState.startX;
      const dy = clampedY - dragState.startY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      dragState.active = true;
      document.body.classList.add("marquee-no-select");
    }

    const { left, right, top, bottom, style } = computeMarqueeGeometry(
      dragState,
      clampedX,
      clampedY,
      containerRect,
      container
    );
    setMarqueeBox(style);

    const nextSelected = new Set<number>();
    for (const block of currentBlocks) {
      const element = blockElementRefs.current.get(block.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const intersects =
        rect.left < right &&
        rect.right > left &&
        rect.top < bottom &&
        rect.bottom > top;
      if (intersects) nextSelected.add(block.id);
    }
    setSelectedBlockIds(nextSelected);
  }

  function endWorkspacePointerGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = marqueeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const container = event.currentTarget;
    if (container.hasPointerCapture(dragState.pointerId)) {
      container.releasePointerCapture(dragState.pointerId);
    }

    if (!dragState.active) {
      // A plain click (never crossed the marquee threshold): clear
      // selection as before, and — only when there's something to paste —
      // open the contextual Paste popup at the release point. A completed
      // marquee drag (the `else` of this branch) never shows it.
      setSelectedBlockIds(new Set());
      if (copiedBlocks.length > 0) {
        showContextualPaste(event.clientX, event.clientY, container);
      }
    }

    document.body.classList.remove("marquee-no-select");
    marqueeDragRef.current = null;
    setMarqueeBox(null);
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

  function copySelectedBlocks() {
    if (selectedBlockIds.size === 0) return;
    const ordered = currentBlocks.filter((block) =>
      selectedBlockIds.has(block.id)
    );
    setCopiedBlocks(ordered.map((block) => cloneBlock(block, false)));
  }

  // The one shared paste operation — used by the top-right Paste button,
  // Cmd/Ctrl+V, and the contextual popup alike. `atIndex` is the root-level
  // insertion index; omitted (top-right button, keyboard) it appends to the
  // end, exactly as before. Every call always deep-clones with fresh ids
  // (never reuses ids from the originals or from an earlier paste).
  function pasteClipboard(atIndex?: number) {
    if (copiedBlocks.length === 0) return;
    const pasted = copiedBlocks.map((block) => cloneBlock(block, true));
    setCurrentBlocks((previous) => {
      const index =
        atIndex === undefined
          ? previous.length
          : Math.max(0, Math.min(atIndex, previous.length));
      const next = [...previous];
      next.splice(index, 0, ...pasted);
      return next;
    });
    setSelectedBlockIds(new Set(pasted.map((block) => block.id)));
    setContextualPaste(null);
  }

  function deleteSelectedBlocks() {
    if (selectedBlockIds.size === 0) return;
    setCurrentBlocks((previous) => {
      let result = previous;
      for (const id of selectedBlockIds) {
        result = removeBlockById(result, id).updatedBlocks;
      }
      return result;
    });
    setSelectedBlockIds(new Set());
  }

  // Re-subscribed every render (cheap for a keydown listener, unlike the
  // mousemove one above) so the guards and actions below always see the
  // current selection/clipboard/workspace without needing ref mirrors.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableEventTarget(event.target)) return;

      const isMeta = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        if (selectedBlockIds.size === 0 && !contextualPaste) return;
        event.preventDefault();
        clearSelection();
        setContextualPaste(null);
        return;
      }

      if (isMeta && event.key.toLowerCase() === "c") {
        if (hasActiveTextSelection()) return;
        if (selectedBlockIds.size === 0) return;
        event.preventDefault();
        copySelectedBlocks();
        return;
      }

      if (isMeta && event.key.toLowerCase() === "v") {
        if (copiedBlocks.length === 0) return;
        event.preventDefault();
        pasteClipboard();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedBlockIds.size === 0) return;
        event.preventDefault();
        deleteSelectedBlocks();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Dismiss the contextual popup on a press anywhere outside it — covers
  // clicks in the toolbox/output/header, which sit outside the workspace
  // container and so never reach handleWorkspacePointerDown's own dismiss.
  // Only mounted while the popup actually exists.
  useEffect(() => {
    if (!contextualPaste) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".contextual-paste-popup")) {
        return;
      }
      setContextualPaste(null);
    }

    window.addEventListener("pointerdown", handleOutsidePointerDown);
    return () =>
      window.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [contextualPaste]);

  // Measures the selected blocks' combined DOM bounds and stores the
  // floating toolbar's container-relative position. This is a standard
  // "synchronize with the DOM after a state change" effect, so it belongs
  // in an effect (unlike the tab-switch reset above, which was resetting
  // fixed values rather than measuring anything).
  useEffect(() => {
    const container = workspaceContainerRef.current;
    if (selectedBlockIds.size === 0 || !container) {
      setToolbarStyle(undefined);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;

    for (const id of selectedBlockIds) {
      const element = blockElementRefs.current.get(id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
      maxRight = Math.max(maxRight, rect.right);
    }

    if (!Number.isFinite(minLeft)) {
      setToolbarStyle(undefined);
      return;
    }

    const left = minLeft - containerRect.left + container.scrollLeft;
    const top = minTop - containerRect.top + container.scrollTop;
    const right = maxRight - containerRect.left + container.scrollLeft;

    setToolbarStyle({
      left: Math.max(Math.min(left, right - 68), 0),
      top: Math.max(top - 44, 0),
    });
    // currentBlocks is also a dependency: a group move keeps the same
    // selectedBlockIds (same Set, no clone/reselect), but the selected
    // blocks' on-screen position changes when their order changes, so the
    // toolbar needs to re-measure then too, not just when selection itself
    // changes.
  }, [selectedBlockIds, currentBlocks]);

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
      if (expression.type !== "array" && expression.type !== "set" && expression.type !== "tuple") {
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
      if (expression.type !== "array" && expression.type !== "set" && expression.type !== "tuple") {
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

  // Toggles one slice bound between omitted (null) and an editable slot.
  // Used for start/stop (always present, individually optional) and for
  // step (whose presence also controls whether the block shows the compact
  // [start:stop] form or the expanded [start:stop:step] form).
  function setSliceField(
    id: number,
    field: "start" | "stop" | "step",
    value: Expression | null
  ) {
    updateCurrentExpression(id, (expression) => {
      if (expression.type !== "slice") return expression;
      return { ...expression, [field]: value };
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

  // A short-lived off-screen node used as the native drag image for a group
  // move — standard technique for HTML5 DnD custom previews: the browser
  // snapshots it synchronously inside setDragImage, so it's safe to remove
  // right after.
  function setGroupDragImage(event: DragEvent<HTMLDivElement>, count: number) {
    const badge = document.createElement("div");
    badge.className = "group-drag-badge";
    badge.textContent = `${count} blocks`;
    document.body.appendChild(badge);
    event.dataTransfer.setDragImage(badge, 18, 16);
    window.setTimeout(() => {
      badge.parentNode?.removeChild(badge);
    }, 0);
  }

  function handleWorkspaceBlockDragStart(
    event: DragEvent<HTMLDivElement>,
    id: number,
    isTopLevel: boolean
  ) {
    event.stopPropagation();
    setContextualPaste(null);

    // Dragging any one of a multi-selection moves the whole group. This is
    // scoped to isTopLevel because selectedBlockIds only ever holds
    // top-level ids — without the guard, starting a drag on some unrelated
    // NESTED block (which can never be "selected") would still see
    // selectedBlockIds.size > 0 and incorrectly steal/clobber the top-level
    // selection.
    if (isTopLevel && selectedBlockIds.has(id) && selectedBlockIds.size > 1) {
      const orderedIds = currentBlocks
        .filter((block) => selectedBlockIds.has(block.id))
        .map((block) => block.id);

      event.dataTransfer.setData("source", "workspace-group");
      event.dataTransfer.setData("blockIds", JSON.stringify(orderedIds));
      event.dataTransfer.effectAllowed = "move";
      setGroupDragImage(event, orderedIds.length);
      return;
    }

    // Dragging a block that isn't part of the current selection is a plain
    // single-block drag — if something else was selected, that selection no
    // longer applies to what's actually being dragged, so it moves to just
    // this block instead (matches the click-to-select model elsewhere).
    if (isTopLevel && !selectedBlockIds.has(id) && selectedBlockIds.size > 0) {
      setSelectedBlockIds(new Set([id]));
    }

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

    // A group move of the current multi-selection — see
    // handleWorkspaceBlockDragStart. This is a MOVE, never a copy: the same
    // Block objects (same ids) are removed from wherever they are and
    // reinserted at the drop target, nothing is cloned and no id is
    // regenerated. A single-slot expression target can't hold more than one
    // block, so that combination is simply a no-op.
    if (source === "workspace-group" && finalTarget.area !== "expression") {
      let ids: number[] = [];
      try {
        ids = JSON.parse(event.dataTransfer.getData("blockIds"));
      } catch {
        ids = [];
      }

      if (ids.length > 0) {
        setCurrentBlocks((previous) => {
          const idSet = new Set(ids);

          if ("parentId" in finalTarget) {
            const dropsIntoOwnSubtree = ids.some((id) => {
              const block = findBlockById(previous, id);
              return (
                block !== null &&
                blockContainsBlockId(block, finalTarget.parentId)
              );
            });
            if (dropsIntoOwnSubtree) return previous;
          }

          const adjustedTarget = adjustTargetAfterGroupRemoval(
            previous,
            idSet,
            finalTarget
          );
          const { updatedBlocks, removedBlocks } = removeBlocksByIds(
            previous,
            ids
          );

          if (removedBlocks.length === 0) return previous;

          return insertManyIntoBlocks(
            updatedBlocks,
            adjustedTarget,
            removedBlocks
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
    setSelectedBlockIds((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
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
            {renderBlock(block, area === "root")}
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
    expression: ArrayExpression | SetExpression | TupleExpression
  ) {
    const opening =
      expression.type === "array" ? "[" : expression.type === "tuple" ? "(" : "{";
    const closing =
      expression.type === "array" ? "]" : expression.type === "tuple" ? ")" : "}";

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
            {(index < expression.items.length - 1 ||
              (expression.type === "tuple" && expression.items.length === 1)) && (
              <span>,</span>
            )}
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

  function renderIndexContent(expression: IndexExpression) {
    return (
      <div className="expression-content-row access-content-row">
        {renderExpressionSlot(
          expression.target,
          "target",
          "access-target-slot",
          60,
          150
        )}
        <span className="collection-bracket">[</span>
        {renderExpressionSlot(
          expression.index,
          "index",
          "access-index-slot",
          40,
          100
        )}
        <span className="collection-bracket">]</span>
      </div>
    );
  }

  // Item assignment: target[index] = value. Works for a list (by position) or
  // a dict (by key); a tuple/string target errors at run time, matching Python.
  function renderSetItemContent(block: SetItemBlock) {
    return (
      <div className="expression-content-row access-content-row">
        {renderExpressionSlot(block.target, "target", "access-target-slot", 60, 150)}
        <span className="collection-bracket">[</span>
        {renderExpressionSlot(block.index, "index", "access-index-slot", 40, 100)}
        <span className="collection-bracket">]</span>
        <span className="assignment-equals">=</span>
        {renderExpressionSlot(block.value, "value", "setitem-value-slot", 60, 180)}
      </div>
    );
  }

  // A single start/stop position inside [start:stop] — either an editable
  // slot (value !== null) with a way to clear it back to omitted, or a small
  // placeholder chip (value === null) that creates a fresh slot on click.
  function renderSliceBound(
    expression: SliceExpression,
    field: "start" | "stop",
    placeholder: string
  ) {
    const value = expression[field];

    if (value === null) {
      return (
        <button
          type="button"
          className="slice-bound-empty"
          title={`Set ${field}`}
          onClick={(event) => {
            event.stopPropagation();
            setSliceField(expression.id, field, createAtomicExpression());
          }}
        >
          {placeholder}
        </button>
      );
    }

    return (
      <span className="slice-bound-filled">
        {renderExpressionSlot(value, placeholder, "slice-bound-slot", 36, 90)}
        <button
          type="button"
          className="remove-chain-button"
          title={`Clear ${field}`}
          onClick={(event) => {
            event.stopPropagation();
            setSliceField(expression.id, field, null);
          }}
        >
          ×
        </button>
      </span>
    );
  }

  function renderSliceContent(expression: SliceExpression) {
    const hasStep = expression.step !== null;

    return (
      <div className="expression-content-row access-content-row slice-content-row">
        {renderExpressionSlot(
          expression.target,
          "target",
          "access-target-slot",
          60,
          150
        )}
        <span className="collection-bracket">[</span>
        {renderSliceBound(expression, "start", "start")}
        <span>:</span>
        {renderSliceBound(expression, "stop", "stop")}
        {hasStep && (
          <>
            <span>:</span>
            {renderExpressionSlot(expression.step as Expression, "step", "slice-bound-slot", 36, 90)}
          </>
        )}
        <span className="collection-bracket">]</span>
        <button
          type="button"
          className={hasStep ? "remove-chain-button" : "expand-expression-button"}
          title={hasStep ? "Remove step" : "Add step"}
          onClick={(event) => {
            event.stopPropagation();
            setSliceField(
              expression.id,
              "step",
              hasStep ? null : createAtomicExpression()
            );
          }}
        >
          {hasStep ? "×" : "+"}
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
              expression.type === "tuple" ||
              expression.type === "dictionary"
            ? "collection-expression"
            : expression.type === "index" || expression.type === "slice"
              ? "access-expression"
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
        {(expression.type === "array" ||
          expression.type === "set" ||
          expression.type === "tuple") &&
          renderCollectionContent(expression)}
        {expression.type === "dictionary" &&
          renderDictionaryContent(expression)}
        {expression.type === "index" && renderIndexContent(expression)}
        {expression.type === "slice" && renderSliceContent(expression)}
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

  function renderBlock(block: Block, isTopLevel = false) {
    return (
      <div
        ref={(element) => {
          if (element) blockElementRefs.current.set(block.id, element);
          else blockElementRefs.current.delete(block.id);
        }}
        className={`scratch-block ${block.type}-block ${
          isContainerBlock(block) ? "container-block" : ""
        } ${
          block.type === "builtinCall"
            ? `builtin-call-${getBuiltinGroupId(block.name)}`
            : ""
        } ${
          isTopLevel && selectedBlockIds.has(block.id) ? "block-selected" : ""
        }`}
        draggable
        onDragStart={(event) =>
          handleWorkspaceBlockDragStart(event, block.id, isTopLevel)
        }
        onDragEnd={handleDragEnd}
        onClick={
          isTopLevel
            ? (event) => handleBlockClick(event, block.id)
            : undefined
        }
      >
        <button
          className="delete-button"
          onClick={() => deleteBlock(block.id)}
        >
          ×
        </button>

        {block.type === "variable" && (
          <VariableBlockView
            block={block}
            updateBlockField={updateBlockField}
            getInputWidth={getInputWidth}
            renderExpressionSlot={renderExpressionSlot}
            expandVariableAssignment={expandVariableAssignment}
          />
        )}

        {block.type === "setItem" && (
          <div className="block-row expression-enabled-row">
            {renderSetItemContent(block)}
          </div>
        )}

        {block.type === "parallelAssign" && (
          <ParallelAssignBlockView
            block={block}
            getInputWidth={getInputWidth}
            updateParallelTarget={updateParallelTarget}
            renderExpressionSlot={renderExpressionSlot}
            removeParallelPair={removeParallelPair}
            addParallelPair={addParallelPair}
          />
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

        {(block.type === "array" ||
          block.type === "set" ||
          block.type === "tuple") && (
          <div className="block-row expression-enabled-row">
            {renderCollectionContent(block)}
          </div>
        )}

        {block.type === "dictionary" && (
          <div className="block-row expression-enabled-row">
            {renderDictionaryContent(block)}
          </div>
        )}

        {block.type === "index" && (
          <div className="block-row expression-enabled-row">
            {renderIndexContent(block)}
          </div>
        )}

        {block.type === "slice" && (
          <div className="block-row expression-enabled-row">
            {renderSliceContent(block)}
          </div>
        )}

        {block.type === "print" && (
          <PrintBlockView block={block} renderExpressionSlot={renderExpressionSlot} />
        )}

        {block.type === "return" && (
          <ReturnBlockView block={block} renderExpressionSlot={renderExpressionSlot} />
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
          <IfBlockView
            block={block}
            renderExpressionSlot={renderExpressionSlot}
            renderNestedArea={renderNestedArea}
            removeElifBranch={removeElifBranch}
            addElifBranch={addElifBranch}
            addElseBranch={addElseBranch}
            removeElseBranch={removeElseBranch}
          />
        )}

        {block.type === "while" && (
          <WhileBlockView
            block={block}
            renderExpressionSlot={renderExpressionSlot}
            renderNestedArea={renderNestedArea}
          />
        )}

        {block.type === "for" && (
          <ForBlockView
            block={block}
            getInputWidth={getInputWidth}
            updateBlockField={updateBlockField}
            renderExpressionSlot={renderExpressionSlot}
            renderNestedArea={renderNestedArea}
          />
        )}

        {block.type === "tryCatch" && (
          <TryCatchBlockView
            block={block}
            renderNestedArea={renderNestedArea}
            updateCatchErrorType={updateCatchErrorType}
            removeCatchBranch={removeCatchBranch}
            addCatchBranch={addCatchBranch}
          />
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
          {renderPaletteBlock("tuple", "tuple", "tuple-template")}
          {renderPaletteBlock("set", "set", "set-template")}
          {renderPaletteBlock("dictionary", "dictionary", "dictionary-template")}
        </>
      ),
    },
    {
      id: "access",
      label: "Access",
      color: "var(--cyan-block)",
      layout: "stack",
      content: (
        <>
          {renderPaletteBlock("Get Item", "index", "index-template")}
          {renderPaletteBlock("Slice", "slice", "slice-template")}
          {renderPaletteBlock("Set Item", "setItem", "index-template")}
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
              : group.id === "tuple"
                ? "amber"
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
            ref={workspaceContainerRef}
            className="drop-zone workspace-mode-card"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) =>
              handleDrop(event, {
                area: "root",
                index: currentBlocks.length,
              })
            }
            onPointerDown={handleWorkspacePointerDown}
            onPointerMove={handleWorkspacePointerMove}
            onPointerUp={endWorkspacePointerGesture}
            onPointerCancel={endWorkspacePointerGesture}
          >
            <div
              className="zoom-canvas"
              style={{ transform: `scale(${zoom})` }}
            >
              {renderBlockList(currentBlocks, "root")}
            </div>

            {marqueeBox && (
              <div className="marquee-selection-box" style={marqueeBox} />
            )}

            {selectedBlockIds.size > 0 && (
              <div
                className="selection-toolbar"
                style={toolbarStyle}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="selection-toolbar-button"
                  title="Copy selected blocks"
                  aria-label="Copy selected blocks"
                  onClick={copySelectedBlocks}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <rect x="4" y="4" width="12" height="12" rx="2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="selection-toolbar-button selection-toolbar-delete"
                  title="Delete selected blocks"
                  aria-label="Delete selected blocks"
                  onClick={deleteSelectedBlocks}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16" />
                    <path d="M9 7V4h6v3" />
                    <path d="M6 7l1 13h10l1-13" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            )}

            {contextualPaste && (
              <div
                className="contextual-paste-popup"
                style={contextualPaste.style}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="contextual-paste-button"
                  title="Paste"
                  aria-label="Paste"
                  onClick={() => pasteClipboard(contextualPaste.insertionIndex)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
                    <rect x="6" y="6" width="12" height="15" rx="2" />
                  </svg>
                  <span>Paste</span>
                </button>
              </div>
            )}
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

