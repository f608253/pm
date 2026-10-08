import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { cardDndId, type Card } from "@/lib/kanban";
import { CardActionsMenu } from "@/components/CardActionsMenu";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: number) => void;
  onUpdateCard: (cardId: number, updates: { details?: string; priority?: string }) => void;
  boardId: number;
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const stopPropagation = (e: React.MouseEvent) => {
  e.stopPropagation();
};

export const KanbanCard = ({ card, onDelete, onUpdateCard, boardId }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cardDndId(card.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "relative z-10 rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div {...attributes} {...listeners} className="cursor-move">
              <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                {card.title}
              </h4>
            </div>
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                PRIORITY_COLORS[card.priority] || "bg-gray-100 text-gray-800 border-gray-200"
              )}
            >
              {card.priority}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <CardActionsMenu cardId={card.id} boardId={boardId} onUpdateCard={onUpdateCard} />
          <button
            type="button"
            onClick={(e) => {
              stopPropagation(e);
              onDelete(card.id);
            }}
            onPointerDown={stopPropagation}
            className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
            aria-label={`Delete ${card.title}`}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
};
