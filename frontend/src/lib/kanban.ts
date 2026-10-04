export type Card = {
  id: number;
  title: string;
  details: string;
};

export type Column = {
  id: number;
  title: string;
  cards: Card[];
};

export type Board = {
  id: number;
  title: string;
  columns: Column[];
};

export type BoardSummary = {
  id: number;
  title: string;
};

// Column ids and card ids are both integers and can collide, so drag and drop
// ids are namespaced by prefix.
export const columnDndId = (id: number) => `c${id}`;
export const cardDndId = (id: number) => `d${id}`;

type DndTarget =
  | { kind: "column"; columnId: number }
  | { kind: "card"; columnId: number; cardId: number };

const parseTarget = (columns: Column[], dndId: string): DndTarget | null => {
  if (dndId.length < 2) {
    return null;
  }

  const id = Number(dndId.slice(1));
  if (Number.isNaN(id)) {
    return null;
  }

  if (dndId.startsWith("c")) {
    return columns.some((column) => column.id === id)
      ? { kind: "column", columnId: id }
      : null;
  }

  for (const column of columns) {
    if (column.cards.some((card) => card.id === id)) {
      return { kind: "card", columnId: column.id, cardId: id };
    }
  }
  return null;
};

export const moveCard = (
  columns: Column[],
  activeDndId: string,
  overDndId: string
): Column[] => {
  const active = parseTarget(columns, activeDndId);
  const over = parseTarget(columns, overDndId);

  if (!active || !over || active.kind !== "card") {
    return columns;
  }

  const activeCard = columns
    .find((column) => column.id === active.columnId)
    ?.cards.find((card) => card.id === active.cardId);

  if (!activeCard) {
    return columns;
  }

  return columns.map((column) => {
    let cards = column.cards;

    if (column.id === active.columnId) {
      cards = cards.filter((card) => card.id !== active.cardId);
    }

    if (column.id === over.columnId) {
      const overIndex =
        over.kind === "card"
          ? cards.findIndex((card) => card.id === over.cardId)
          : cards.length;
      const insertAt = overIndex === -1 ? cards.length : overIndex;
      cards = [...cards.slice(0, insertAt), activeCard, ...cards.slice(insertAt)];
    }

    return cards === column.cards ? column : { ...column, cards };
  });
};