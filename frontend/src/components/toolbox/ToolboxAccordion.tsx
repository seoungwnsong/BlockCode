import type { CSSProperties, ReactNode } from "react";

export type ToolboxCategory = {
  id: string;
  label: string;
  color: string;
  layout: "stack" | "grid";
  content: ReactNode;
};

type ToolboxAccordionProps = {
  categories: ToolboxCategory[];
  activeCategory: string | null;
  onToggleCategory: (id: string) => void;
};

export function ToolboxAccordion({
  categories,
  activeCategory,
  onToggleCategory,
}: ToolboxAccordionProps) {
  return (
    <aside className="function-sidebar toolbox-sidebar app-font">
      <div className="sidebar-header">
        <h1>Toolbox</h1>
      </div>

      <div className="toolbox-accordion">
        {categories.map((category) => {
          const isExpanded = activeCategory === category.id;

          return (
            <div
              key={category.id}
              className={`toolbox-category ${
                isExpanded ? "toolbox-category-active" : ""
              }`}
            >
              <button
                type="button"
                className="toolbox-category-row"
                style={
                  { "--category-color": category.color } as CSSProperties
                }
                aria-expanded={isExpanded}
                onClick={() => onToggleCategory(category.id)}
              >
                <span className="toolbox-category-bar" />
                <span className="toolbox-category-label">
                  {category.label}
                </span>
              </button>

              <div
                className={`toolbox-category-content ${
                  isExpanded ? "toolbox-category-expanded" : ""
                }`}
              >
                <div className="toolbox-category-content-inner">
                  <div
                    className={
                      category.layout === "grid"
                        ? "toolbox-category-body builtin-list"
                        : "toolbox-category-body toolbox-stack"
                    }
                  >
                    {category.content}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
