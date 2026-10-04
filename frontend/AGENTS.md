# Frontend Codebase Documentation

## Overview

A NextJS 16 Kanban board application with drag-and-drop functionality. Statically
exported and served by FastAPI at `/`. It has a working sign-in flow guarding the
board, but no backend persistence: board data is still in-memory on the client.

## Technology Stack

- **Framework:** NextJS 16.1.6 (App Router)
- **React:** 19.2.3
- **TypeScript:** 5.x (strict mode)
- **Styling:** Tailwind CSS v4 with custom CSS variables
- **Drag & Drop:** @dnd-kit (core, sortable, utilities)
- **Testing:** Vitest (unit) + Playwright (e2e)
- **Utilities:** clsx for class management

## Project Structure

```
frontend/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── layout.tsx    # Root layout with fonts
│   │   ├── page.tsx      # Home page (renders AppRoot)
│   │   └── globals.css   # Global styles and CSS variables
│   ├── components/       # UI components
│   │   ├── AppRoot.tsx   # Auth gate: login form vs board
│   │   ├── LoginForm.tsx # Sign in form
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── KanbanCard.tsx
│   │   ├── KanbanCardPreview.tsx
│   │   └── NewCardForm.tsx
│   ├── lib/             # Business logic & utilities
│   │   ├── api.ts       # fetch wrapper, token storage, auth calls
│   │   ├── kanban.ts    # Types, data, business logic
│   │   └── kanban.test.ts
│   └── test/            # Test configuration
│       └── setup.ts
├── tests/               # E2E tests
│   └── kanban.spec.ts
├── public/              # Static assets
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── playwright.config.ts
```

## Core Components

### KanbanBoard.tsx (165 lines)
**Path:** `src/components/KanbanBoard.tsx`

Main container component managing the entire board state.

**Key Features:**
- Client component (`"use client"`)
- State: `boardData` (columns and cards), `activeCard` (for drag preview)
- Uses `DndContext` from @dnd-kit for drag-and-drop
- Sensors: pointer and keyboard with activation constraints
- Handlers: `handleDragStart`, `handleDragEnd`, `handleRenameColumn`, `handleAddCard`, `handleDeleteCard`

**Layout:**
- Decorative gradient backgrounds (3 radial gradients)
- Sticky header with title and backdrop blur
- Responsive grid: 5 columns on large screens, 1 on mobile

**Dependencies:**
- `@dnd-kit/core`: DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors
- `@dnd-kit/sortable`: SortableContext, verticalListSortingStrategy
- All child components

### KanbanColumn.tsx (71 lines)
**Path:** `src/components/KanbanColumn.tsx`

Individual column component with droppable area.

**Props:**
- `column`: Column object (id, title, cardIds)
- `cards`: Card[] array for this column
- `onRename`: Callback for column title changes
- `onAddCard`: Callback when new card is added
- `onDeleteCard`: Callback when card is deleted

**Key Features:**
- Uses `useDroppable` hook for drop target
- Inline editable title (input field)
- Card counter badge
- Empty state: "Drop a card here"
- Integrates `NewCardForm` at bottom

### KanbanCard.tsx (53 lines)
**Path:** `src/components/KanbanCard.tsx`

Individual draggable card component.

**Props:**
- `card`: Card object (id, title, details)
- `onDelete`: Callback for delete action

**Key Features:**
- Uses `useSortable` hook from @dnd-kit
- Transform and transition styles during drag
- Opacity 50% when dragging
- Delete button (top-right) with accessibility label
- Shows title (bold) and details (gray text)

### KanbanCardPreview.tsx (20 lines)
**Path:** `src/components/KanbanCardPreview.tsx`

Simplified card view used in `DragOverlay`.

**Props:**
- `card`: Card object

**Key Features:**
- Same visual style as KanbanCard
- No interactive elements
- Used for drag preview feedback

### NewCardForm.tsx (75 lines)
**Path:** `src/components/NewCardForm.tsx`

Toggle-able form for adding new cards.

**Props:**
- `onSubmit`: Callback with { title, details }

**Key Features:**
- Toggle button: "Add a card"
- Controlled form state (title, details)
- Title required, details optional
- Submit/Cancel buttons
- Resets form after submission
- Collapses after submit or cancel

## Business Logic

### kanban.ts (168 lines)
**Path:** `src/lib/kanban.ts`

Core types, data structures, and business logic.

**Types:**
```typescript
type Card = {
  id: string;
  title: string;
  details: string;
};

type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};
```

**Initial Data:**
- 5 fixed columns: Backlog, Discovery, In Progress, Review, Done
- 8 sample cards distributed across columns
- Cards stored as flat Record<string, Card> indexed by ID
- Columns store only cardIds arrays

**Key Functions:**

`moveCard(boardData, activeId, overId)`
- Handles drag-and-drop logic
- Same column: reorders cards
- Different columns: moves card between columns
- Returns new BoardData (immutable)

`createId()`
- Generates unique IDs: `card-${random}-${timestamp}` or `column-${random}-${timestamp}`

`isColumnId(id)`, `findColumnId(boardData, cardId)`
- Helper utilities for ID management

## Styling

### Color Scheme (globals.css)
Defined as CSS variables matching project requirements:

```css
--accent-yellow: #ecad0a;    /* highlights, accents */
--primary-blue: #209dd7;     /* links, key sections */
--secondary-purple: #753991; /* submit buttons */
--navy-dark: #032147;        /* main headings */
--gray-text: #888888;        /* supporting text */
```

Additional variables:
- `--surface`: #ffffff (cards, columns)
- `--surface-strong`: #f9fafb (hover states)
- `--stroke`: #e5e7eb (borders)
- `--shadow`: rgba(0, 0, 0, 0.1) (drop shadows)

### Fonts
- **Display:** Space Grotesk (headings, card titles)
- **Body:** Manrope (general text)

### Design System
- Rounded corners: `rounded-2xl`, `rounded-3xl`, `rounded-full`
- Shadows: `shadow-sm`, `shadow-lg`
- Transitions: 200ms durations
- Backdrop blur on header
- Gradient backgrounds for visual interest

## State Management

**Approach:** Local React state (useState)

All state lives in `KanbanBoard` component:
```typescript
const [boardData, setBoardData] = useState<BoardData>(initialData);
const [activeCard, setActiveCard] = useState<Card | null>(null);
```

**No external state management** (Redux, Zustand, etc.)

**Data Flow:**
1. User action in child component
2. Callback to KanbanBoard
3. State update via setBoardData
4. Re-render with new data

## Testing

### Unit Tests (Vitest)

**kanban.test.ts:**
- Tests `moveCard` logic
- Same column reordering
- Cross-column moves
- Edge cases

**KanbanBoard.test.tsx:**
- Renders all five columns
- Renames a column
- Adds a card
- Deletes a card

**Test Environment:**
- jsdom for DOM simulation
- @testing-library/react for component testing
- @testing-library/user-event for interactions

**Run Commands:**
```bash
npm run test:unit        # Run once
npm run test:unit:watch  # Watch mode
```

### E2E Tests (Playwright)

**kanban.spec.ts:**
- Loads the kanban board
- Adds a card to a column
- Moves a card between columns (full drag simulation)

**Configuration:**
- Runs against the Docker-served build at http://127.0.0.1:8000
- Overridable with PLAYWRIGHT_BASE_URL
- No dev server is started: static export ignores Next rewrites, so a standalone
  `next dev` cannot proxy /api
- Chromium only

**Run Command:**
```bash
npm run test:e2e
```

## Current Limitations

**No Backend Integration:**
- Board data is in-memory, held in React state
- No API calls for board data
- Resets on page refresh
- No persistence layer
- Auth calls the backend, but the board does not

**Authentication:**
- Sign-in gate in `AppRoot.tsx`; token in localStorage
- Backend holds sessions in process memory, so a container restart signs the user out

**No AI Integration:**
- No chat sidebar
- No AI endpoints
- No conversation history

**Not Containerized:**
- Standalone Next.js app
- Not part of Docker setup yet
- Runs on port 3000 directly

## Development

**Install:**
```bash
npm install
```

**Dev Server:**
```bash
npm run dev
```
Runs on http://localhost:3000

**Build:**
```bash
npm run build
```
Creates production build in `.next/`

**Production:**
```bash
npm run start
```
Serves production build

**Lint:**
```bash
npm run lint
```

## Integration Points for Backend

### Data Structures Ready for API
The `BoardData`, `Column`, and `Card` types in `kanban.ts` are designed for JSON serialization and can be used directly with backend APIs.

### State Management Hooks
All state mutations go through callback props, making it straightforward to replace local state updates with API calls:
- `handleAddCard` → POST /api/cards
- `handleDeleteCard` → DELETE /api/cards/:id
- `handleRenameColumn` → PATCH /api/columns/:id
- `handleDragEnd` → PATCH /api/cards/:id/move

### User Context
Currently no user concept. Will need:
- User authentication state
- Board scoped to user ID
- Protected routes

### AI Chat Integration
Planned sidebar will need:
- Chat UI component
- WebSocket or polling for AI responses
- Board update notifications
- Optimistic UI updates

## Path Aliases

TypeScript configured with:
```json
"paths": {
  "@/*": ["./src/*"]
}
```

All imports use `@/components/...`, `@/lib/...` pattern.

## Browser Support

Modern browsers with ES2017+ support:
- Chrome/Edge 60+
- Firefox 55+
- Safari 11+

## Key Files Reference

**Entry Point:**
- `src/app/page.tsx` - Renders KanbanBoard

**Components:**
- `src/components/KanbanBoard.tsx` - Main container
- `src/components/KanbanColumn.tsx` - Column component
- `src/components/KanbanCard.tsx` - Card component
- `src/components/NewCardForm.tsx` - Add card form

**Logic:**
- `src/lib/kanban.ts` - Types, data, business logic

**Styling:**
- `src/app/globals.css` - CSS variables, fonts, Tailwind base

**Tests:**
- `src/lib/kanban.test.ts` - Unit tests for logic
- `src/components/KanbanBoard.test.tsx` - Component tests
- `tests/kanban.spec.ts` - E2E tests

## Notes for Agent Integration

1. **Preserve existing functionality** - The drag-and-drop, add/delete/rename features all work well
2. **Match the design system** - Use existing CSS variables and Tailwind patterns
3. **Follow testing patterns** - Add unit tests for logic, component tests for UI, e2e for flows
4. **Type safety** - All code is strictly typed, maintain this
5. **No over-engineering** - Current code is clean and simple, keep it that way
6. **Component composition** - Small, focused components with clear props
7. **Immutable updates** - State updates create new objects, don't mutate

This frontend is production-ready and waiting for backend integration.
