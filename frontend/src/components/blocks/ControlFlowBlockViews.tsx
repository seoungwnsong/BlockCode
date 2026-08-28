import type { ReactNode } from "react";
import type {
  Block,
  Expression,
  ForBlock,
  IfBlock,
  ListArea,
  PythonErrorType,
  TryCatchBlock,
  WhileBlock,
} from "../../types/blocks";
import { ERROR_TYPES } from "../../config/builtins";
import { sanitizeIdentifierInput } from "../../utils/blockTree";

type RenderExpressionSlot = (
  expression: Expression,
  placeholder: string,
  className?: string,
  minWidth?: number,
  maxWidth?: number,
  options?: { showBadge?: boolean; condition?: boolean }
) => ReactNode;

type RenderNestedArea = (
  blockList: Block[],
  area: Exclude<ListArea, "root">,
  parentId: number,
  branchId?: number,
  placeholder?: string
) => ReactNode;

type IfBlockViewProps = {
  block: IfBlock;
  renderExpressionSlot: RenderExpressionSlot;
  renderNestedArea: RenderNestedArea;
  removeElifBranch: (blockId: number, branchId: number) => void;
  addElifBranch: (blockId: number) => void;
  addElseBranch: (blockId: number) => void;
  removeElseBranch: (blockId: number) => void;
};

export function IfBlockView({
  block,
  renderExpressionSlot,
  renderNestedArea,
  removeElifBranch,
  addElifBranch,
  addElseBranch,
  removeElseBranch,
}: IfBlockViewProps) {
  return (
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
  );
}

type ForBlockViewProps = {
  block: ForBlock;
  getInputWidth: (value: string, minWidth?: number, maxWidth?: number) => number;
  updateBlockField: (id: number, field: string, value: unknown) => void;
  renderExpressionSlot: RenderExpressionSlot;
  renderNestedArea: RenderNestedArea;
};

export function ForBlockView({
  block,
  getInputWidth,
  updateBlockField,
  renderExpressionSlot,
  renderNestedArea,
}: ForBlockViewProps) {
  return (
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
        {renderExpressionSlot(block.start, "0", "compact-expression-slot")}
        <span>to</span>
        {renderExpressionSlot(block.end, "10", "compact-expression-slot")}
      </div>
      {renderNestedArea(block.children, "children", block.id)}
    </>
  );
}

type WhileBlockViewProps = {
  block: WhileBlock;
  renderExpressionSlot: RenderExpressionSlot;
  renderNestedArea: RenderNestedArea;
};

export function WhileBlockView({
  block,
  renderExpressionSlot,
  renderNestedArea,
}: WhileBlockViewProps) {
  return (
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
  );
}

type TryCatchBlockViewProps = {
  block: TryCatchBlock;
  renderNestedArea: RenderNestedArea;
  updateCatchErrorType: (
    blockId: number,
    branchId: number,
    errorType: PythonErrorType
  ) => void;
  removeCatchBranch: (blockId: number, branchId: number) => void;
  addCatchBranch: (blockId: number) => void;
};

export function TryCatchBlockView({
  block,
  renderNestedArea,
  updateCatchErrorType,
  removeCatchBranch,
  addCatchBranch,
}: TryCatchBlockViewProps) {
  return (
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
  );
}
