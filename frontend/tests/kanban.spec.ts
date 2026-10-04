import { expect, test, type Locator, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait on the columns, not the "Kanban Studio" heading: the sign in form
  // shares that heading, so it would match before the session is stored.
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
};

const column = (page: Page, index: number): Locator =>
  page.locator('[data-testid^="column-"]').nth(index);

const cardIn = (scope: Locator, title: string): Locator =>
  scope.locator('[data-testid^="card-"]').filter({ hasText: title });

// Every run mutates the shared demo database, so a run that fails part way
// through leaves rows behind. Unique titles keep the next run from tripping
// over that residue and failing for an unrelated reason.
const uniqueTitle = (name: string) =>
  `${name} ${Math.random().toString(36).slice(2, 8)}`;

const findCardColumn = async (page: Page, title: string): Promise<number> => {
  const columns = page.locator('[data-testid^="column-"]');
  const count = await columns.count();
  for (let index = 0; index < count; index += 1) {
    if (await cardIn(columns.nth(index), title).count()) {
      return index;
    }
  }
  throw new Error(`Card "${title}" was not found on the board.`);
};

// Reloading mid-write silently discards the change, so every persistence check
// waits for the actual request instead of sleeping past a fixed debounce.
const writeTo = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === method && path.test(response.url()),
    { timeout: 15000 }
  );

const drag = async (page: Page, source: Locator, target: Locator) => {
  // The board can sit below the fold, and synthetic mouse moves outside the
  // viewport never reach the element, so measure only after scrolling.
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  // Aim at the middle of the target column so the drop lands inside its
  // droppable area no matter how many cards it holds.
  const dropX = to.x + to.width / 2;
  const dropY = to.y + Math.min(to.height / 2, 200);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Clear the sensor's 6px activation distance before travelling.
  await page.mouse.move(startX, startY + 12, { steps: 3 });
  await page.mouse.move(dropX, dropY, { steps: 15 });
  await page.waitForTimeout(150);
  await page.mouse.up();
};

test("shows the sign in form instead of the board when signed out", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("logs no console errors while signing in and using the board", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await signIn(page);
  const target = column(page, 1);
  const title = uniqueTitle("Console check");

  const created = writeTo(page, "POST", /\/api\/columns\/\d+\/cards$/);
  await target.getByRole("button", { name: /add a card/i }).click();
  await target.getByPlaceholder("Card title").fill(title);
  await target.getByRole("button", { name: /add card/i }).click();
  await created;

  const removed = writeTo(page, "DELETE", /\/api\/cards\/\d+$/);
  await cardIn(column(page, 1), title)
    .getByRole("button", { name: /^Delete / })
    .click();
  await removed;

  expect(problems).toEqual([]);
});

test("rejects incorrect credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Next.js injects its own role="alert" route announcer, so scope by text.
  await expect(
    page.getByRole("alert").filter({ hasText: "Incorrect username or password." })
  ).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("signs in and loads the board from the API", async ({ page }) => {
  await signIn(page);

  await expect(page.getByText("Signed in as user")).toBeVisible();
  await expect(cardIn(column(page, 0), "Align roadmap themes")).toBeVisible();
});

test("keeps the session across a page reload", async ({ page }) => {
  await signIn(page);
  await page.reload();

  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("signs out and blocks the board again", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("adds a card that survives a reload, then removes it", async ({ page }) => {
  await signIn(page);
  const target = column(page, 1);
  const title = uniqueTitle("Ephemeral card");

  const created = writeTo(page, "POST", /\/api\/columns\/\d+\/cards$/);
  await target.getByRole("button", { name: /add a card/i }).click();
  await target.getByPlaceholder("Card title").fill(title);
  await target.getByPlaceholder("Details").fill("Temporary.");
  await target.getByRole("button", { name: /add card/i }).click();
  await created;

  await expect(cardIn(target, title)).toBeVisible();

  await page.reload();
  await expect(cardIn(column(page, 1), title)).toBeVisible();

  const removed = writeTo(page, "DELETE", /\/api\/cards\/\d+$/);
  await cardIn(column(page, 1), title)
    .getByRole("button", { name: /^Delete / })
    .click();
  await removed;

  await page.reload();
  await expect(cardIn(column(page, 1), title)).toHaveCount(0);
});

test("renames a column, persists it, then restores it", async ({ page }) => {
  await signIn(page);
  const title = column(page, 2).getByLabel("Column title");
  // Restore whatever is there now rather than a hardcoded seed value, so the
  // test heals a board that a previously failed run left renamed.
  const original = await title.inputValue();
  const renamed = uniqueTitle("TEMP_RENAMED");

  const renamedWrite = writeTo(page, "PATCH", /\/api\/columns\/\d+$/);
  await title.fill(renamed);
  await expect(title).toHaveValue(renamed);
  await renamedWrite;

  await page.reload();
  await expect(column(page, 2).getByLabel("Column title")).toHaveValue(renamed);

  const restoredWrite = writeTo(page, "PATCH", /\/api\/columns\/\d+$/);
  await column(page, 2).getByLabel("Column title").fill(original);
  await restoredWrite;

  await page.reload();
  await expect(column(page, 2).getByLabel("Column title")).toHaveValue(original);
});

test("moves a card between columns, persists it, then moves it back", async ({ page }) => {
  await signIn(page);
  // A previously failed run may have left the card in another column, so find
  // where it actually lives instead of assuming the seed layout.
  const origin = await findCardColumn(page, "Gather customer signals");
  const targetIndex = origin === 3 ? 0 : 3;

  const firstMove = writeTo(page, "PATCH", /\/api\/cards\/\d+$/);
  await drag(page, cardIn(column(page, origin), "Gather customer signals"), column(page, targetIndex));
  await firstMove;
  await expect(cardIn(column(page, targetIndex), "Gather customer signals")).toBeVisible();

  await page.reload();
  await expect(cardIn(column(page, targetIndex), "Gather customer signals")).toBeVisible();

  const secondMove = writeTo(page, "PATCH", /\/api\/cards\/\d+$/);
  await drag(page, cardIn(column(page, targetIndex), "Gather customer signals"), column(page, origin));
  await secondMove;

  await page.reload();
  await expect(cardIn(column(page, origin), "Gather customer signals")).toBeVisible();
});

test("data survives logging out and back in", async ({ page }) => {
  await signIn(page);
  const target = column(page, 4);
  const title = uniqueTitle("Survives session change");

  const created = writeTo(page, "POST", /\/api\/columns\/\d+\/cards$/);
  await target.getByRole("button", { name: /add a card/i }).click();
  await target.getByPlaceholder("Card title").fill(title);
  await target.getByRole("button", { name: /add card/i }).click();
  await created;
  await expect(cardIn(target, title)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await signIn(page);
  await expect(cardIn(column(page, 4), title)).toBeVisible();

  const removed = writeTo(page, "DELETE", /\/api\/cards\/\d+$/);
  await cardIn(column(page, 4), title)
    .getByRole("button", { name: /^Delete / })
    .click();
  await removed;

  await page.reload();
  await expect(cardIn(column(page, 4), title)).toHaveCount(0);
});

test("an expired session returns the user to the sign in form", async ({ page }) => {
  await signIn(page);

  await page.evaluate(() => {
    window.localStorage.setItem("kanban-studio-token", "definitely-not-valid");
  });
  await page.reload();

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("the assistant panel opens, chats, and closes", async ({ page }) => {
  await signIn(page);

  await page.getByRole("button", { name: "Ask the assistant" }).click();
  const log = page.getByTestId("chat-log");
  await expect(log).toBeVisible();

  const title = uniqueTitle("Chat check");
  await page.getByLabel("Message the assistant").fill(`Add a card named ${title} to Backlog.`);
  await page.getByLabel("Message the assistant").press("Enter");

  // The assistant writes the card straight to the database.
  await expect(cardIn(column(page, 0), title)).toBeVisible({ timeout: 120_000 });
  await expect(log).toContainText("Added", { timeout: 120_000 });
  await expect(page.getByTestId("chat-notice")).toBeVisible();

  const removed = writeTo(page, "DELETE", /\/api\/cards\/\d+$/);
  await cardIn(column(page, 0), title)
    .getByRole("button", { name: /^Delete / })
    .click();
  await removed;
});

test("the assistant answers a question without changing the board", async ({ page }) => {
  await signIn(page);
  const before = await page.locator('[data-testid^="card-"]').count();

  await page.getByRole("button", { name: "Ask the assistant" }).click();
  const log = page.getByTestId("chat-log");
  await page.getByLabel("Message the assistant").fill("How many columns are on this board?");
  await page.getByLabel("Message the assistant").press("Enter");

  await expect(log.locator("li").nth(1)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("chat-notice")).toHaveCount(0);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(before);
});

test("the assistant conversation survives closing the panel", async ({ page }) => {
  await signIn(page);

  await page.getByRole("button", { name: "Ask the assistant" }).click();
  await page.getByLabel("Message the assistant").fill("Say hello.");
  await page.getByLabel("Message the assistant").press("Enter");

  const log = page.getByTestId("chat-log");
  await expect(log.locator("li").nth(1)).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Ask the assistant" }).click();

  await expect(log.locator("li")).toHaveCount(2);
});