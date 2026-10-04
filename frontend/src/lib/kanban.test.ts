import { describe, expect, it } from "vitest";
import { cardDndId, columnDndId, moveCard, type Column } from "@/lib/kanban";

const card = (id: number, title = `card ${id}`) => ({ id, title, details: "" });

const columns = (): Column[] => [
  { id: 1, title: "Backlog", cards: [card(1), card(2)] },
  { id: 2, title: "Review", cards: [card(3)] },
];

const titles = (list: Column[], columnId: number) =>
  list.find((column) => column.id === columnId)!.cards.map((c) => c.title);

describe("moveCard", () => {
  it("reorders cards within the same column", () => {
    const next = moveCard(columns(), cardDndId(2), cardDndId(1));

    expect(titles(next, 1)).toEqual(["card 2", "card 1"]);
  });

  it("appends when dropped on the target column", () => {
    const next = moveCard(columns(), cardDndId(1), columnDndId(2));

    expect(titles(next, 1)).toEqual(["card 2"]);
    expect(titles(next, 2)).toEqual(["card 3", "card 1"]);
  });

  it("moves a card before a specific card in another column", () => {
    const next = moveCard(columns(), cardDndId(1), cardDndId(3));

    expect(titles(next, 1)).toEqual(["card 2"]);
    expect(titles(next, 2)).toEqual(["card 1", "card 3"]);
  });

  it("appends when dropped on an empty target column", () => {
    const start: Column[] = [
      { id: 1, title: "Backlog", cards: [card(1)] },
      { id: 2, title: "Review", cards: [] },
    ];

    const next = moveCard(start, cardDndId(1), columnDndId(2));

    expect(titles(next, 2)).toEqual(["card 1"]);
  });

  it("does not mutate the input", () => {
    const start = columns();
    const snapshot = JSON.stringify(start);

    moveCard(start, cardDndId(1), columnDndId(2));

    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it("keeps column ids and card ids apart when they collide", () => {
    // Column 1 and card 1 both exist, so a bare "1" would be ambiguous.
    const next = moveCard(columns(), cardDndId(1), columnDndId(2));

    expect(titles(next, 1)).toEqual(["card 2"]);
    expect(titles(next, 2)).toEqual(["card 3", "card 1"]);
  });

  it("returns the input unchanged for unknown ids", () => {
    const start = columns();

    expect(moveCard(start, "d999", "d1")).toBe(start);
    expect(moveCard(start, "nonsense", "d1")).toBe(start);
    expect(moveCard(start, columnDndId(1), cardDndId(1))).toBe(start);
  });
});