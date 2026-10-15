const { test, expect } = require('@playwright/test');
const { openPage } = require('./helpers');

const theme = page => page.locator('html').getAttribute('data-theme');
const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('dark / light background', () => {
  test('follows the system setting the first time', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openPage(page);
    expect(await theme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.removeItem('fk_theme'));
    await page.reload();
    expect(await theme(page)).toBe('light');
  });

  test('the toggle switches the whole background, and the choice survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openPage(page);
    const dark = await bg(page);
    await page.locator('#theme-toggle').click();
    expect(await theme(page)).toBe('light');
    expect(await bg(page)).not.toBe(dark);
    await page.reload();
    expect(await theme(page)).toBe('light');
    await page.locator('#theme-toggle').click();
    expect(await theme(page)).toBe('dark');
    expect(await bg(page)).toBe(dark);
  });

  test('the toggle says what it does, in both languages', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openPage(page);
    const btn = page.locator('#theme-toggle');
    await expect(btn).toContainText('淺色');
    await expect(btn).toHaveAttribute('aria-label', /淺色/);
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(btn).toContainText('Light');
    await btn.click();
    await expect(btn).toContainText('Dark');
  });
});
