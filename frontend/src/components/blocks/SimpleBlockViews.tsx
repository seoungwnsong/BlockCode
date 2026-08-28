import type { ReactNode } from "react";
import type {
  Expression,
  ParallelAssignmentBlock,
  PrintBlock,
  ReturnBlock,
  VariableBlock,
} from "../../types/blocks";
import { sanitizeIdentifierInput } from "../../utils/blockTree";

type RenderExpressionSlot = (
  expression: Expression,
  placeholder: string,
  className?: string,
  minWidth?: number,
  maxWidth?: number,
  options?: { showBadge?: boolean; condition?: boolean }
) => ReactNode;

type VariableBlockViewProps = {
  block: VariableBlock;
  updateBlockField: (id: number, field: string, value: unknown) => void;
  getInputWidth: (value: string, minWidth?: number, maxWidth?: number) => number;
  renderExpressionSlot: RenderExpressionSlot;
  expandVariableAssignment: (blockId: number) => void;
};

export function VariableBlockView({
  block,
  updateBlockField,
  getInputWidth,
  renderExpressionSlot,
  expandVariableAssignment,
}: VariableBlockViewProps) {
  return (
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

      {renderExpressionSlot(block.value, "value", "variable-value-slot", 70, 180)}

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
  );
}

type ParallelAssignBlockViewProps = {
  block: ParallelAssignmentBlock;
  getInputWidth: (value: string, minWidth?: number, maxWidth?: number) => number;
  updateParallelTarget: (blockId: number, index: number, value: string) => void;
  renderExpressionSlot: RenderExpressionSlot;
  removeParallelPair: (blockId: number, index: number) => void;
  addParallelPair: (blockId: number) => void;
};

export function ParallelAssignBlockView({
  block,
  getInputWidth,
  updateParallelTarget,
  renderExpressionSlot,
  removeParallelPair,
  addParallelPair,
}: ParallelAssignBlockViewProps) {
  return (
    <div className="block-row expression-enabled-row parallel-assignment-row">
      <div className="parallel-side parallel-targets">
        {block.targets.map((target, index) => (
          <div className="parallel-item" key={`target-${index}`}>
            <input
              placeholder={`name ${index + 1}`}
              value={target}
              style={{ width: getInputWidth(target, 68, 130) }}
              onChange={(event) =>
                updateParallelTarget(block.id, index, event.target.value)
              }
            />
            {index < block.targets.length - 1 && <span>,</span>}
          </div>
        ))}
      </div>

      <span>=</span>

      <div className="parallel-side parallel-values">
        {block.values.map((value, index) => (
          <div className="parallel-item" key={value.id}>
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

            {index < block.values.length - 1 && <span>,</span>}
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
  );
}

type PrintBlockViewProps = {
  block: PrintBlock;
  renderExpressionSlot: RenderExpressionSlot;
};

export function PrintBlockView({ block, renderExpressionSlot }: PrintBlockViewProps) {
  return (
    <div className="block-row expression-enabled-row">
      <span>print</span>
      {renderExpressionSlot(block.value, "value", "wide-expression-slot", 150, 300)}
    </div>
  );
}

type ReturnBlockViewProps = {
  block: ReturnBlock;
  renderExpressionSlot: RenderExpressionSlot;
};

export function ReturnBlockView({ block, renderExpressionSlot }: ReturnBlockViewProps) {
  return (
    <div className="block-row expression-enabled-row">
      <span>return</span>
      {renderExpressionSlot(block.value, "value", "wide-expression-slot", 150, 300)}
    </div>
  );
}
