import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:8000/');
await page.getByLabel('Username').fill('user');
await page.getByLabel('Password').fill('password');
await page.getByRole('button', { name: 'Sign in' }).click();
await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
await page.waitForTimeout(1000);

// Create card in column 1
const target = page.locator('[data-testid ^="column-"]').nth(1);
await target.getByRole('button', { name: /add a card/i }).click();
await target.getByPlaceholder('Card title').fill('Test card debug');
await target.getByPlaceholder('Details').fill('Temporary.');
await target.getByRole('button', { name: /add card/i }).click();
await page.waitForResponse(r => r.request().method() === 'POST');
await page.waitForTimeout(500);

// Reload
await page.reload();
await expect(page.locator('[data-testid ^="column-"]')).toHaveCount(5);
await page.waitForTimeout(1000);

// Get detailed info about what's at the Delete button position
const result = await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll('[data-testid^="card-"]'))
    .find(c => c.textContent?.includes('Test card debug'));
  if (!card) return { error: 'card not found' };

  const delBtn = card.querySelector('button[aria-label^="Delete"]');
  if (!delBtn) return { error: 'delete button not found', cardId: card.getAttribute('data-testid') };

  delBtn.scrollIntoView();
  const rect = delBtn.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Get all elements at this point
  const elements = document.elementsFromPoint(centerX, centerY) || [];

  // Also check for any full-page overlays
  const allFixed = Array.from(document.querySelectorAll('*')).filter(el => {
    const s = getComputedStyle(el);
    return s.position === 'fixed' && s.zIndex !== 'auto' && s.zIndex !== '' && s.pointerEvents !== 'none';
  });

  return {
    cardRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    centerX, centerY,
    topElement: elements.length > 0 ? {
      tagName: elements[0].tagName,
      testid: elements[0].getAttribute('data-testid'),
      ariaLabel: elements[0].getAttribute('aria-label'),
      className: elements[0].className?.slice(0, 80),
    } : null,
    allElements: elements.map(e => ({
      tagName: e.tagName,
      testid: e.getAttribute('data-testid'),
      ariaLabel: e.getAttribute('aria-label'),
      zIndex: getComputedStyle(e).zIndex,
      pointerEvents: getComputedStyle(e).pointerEvents,
      position: getComputedStyle(e).position,
    })),
    fixedOverlays: allFixed.map(el => ({
      tagName: el.tagName,
      testid: el.getAttribute('data-testid'),
      className: el.className?.slice(0, 80),
      zIndex: getComputedStyle(el).zIndex,
      rect: el.getBoundingClientRect(),
    })),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
