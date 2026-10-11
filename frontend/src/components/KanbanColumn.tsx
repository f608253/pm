import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cardDndId, columnDndId, type Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  onRename: (columnId: number, title: string) => void;
  onAddCard: (columnId: number, title: string, details: string) => void;
  onDeleteCard: (cardId: number) => void;
  onUpdateCard: (cardId: number, updates: { details?: string; priority?: string }) => void;
  boardId: number;
  index: number;
};

export const KanbanColumn = ({
  column,
  onRename,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
  boardId,
  index,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: columnDndId(column.id) });

  const colNum = (index % 5) + 1;
  const colBg = `var(--col-${colNum}-bg)`;
  const colBorder = `var(--col-${colNum}-border)`;
  const colText = `var(--col-${colNum}-text)`;
  const colAccent = `var(--col-${colNum}-border)`;

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border-2 p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      style={{
        backgroundColor: colBg,
        borderColor: colBorder,
      }}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full" style={{ backgroundColor: colAccent }} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: colText }}>
              {column.cards.length} cards
            </span>
          </div>
          <input
            value={column.title}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold outline-none"
            style={{ color: colText }}
            aria-label="Column title"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext
          items={column.cards.map((card) => cardDndId(card.id))}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <KanbanCard key={card.id} card={card} onDelete={onDeleteCard} onUpdateCard={onUpdateCard} boardId={boardId} />
          ))}
        </SortableContext>
        {column.cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em]" style={{ borderColor: colBorder, color: colText }}>
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
