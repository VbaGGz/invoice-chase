/**
 * demo-flow.spec.ts
 * Basic Phase 1 flow tests for Invoice Chase using the toolkit's fast device group.
 * Run with: PWTK_BASE_URL=http://localhost:8080 npx playwright test e2e/demo-flow.spec.ts
 */
import { test, expect } from '@playwright/test';

test.describe('Invoice Chase - Phase 1 Core Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('home view loads with prominent scan button and stats', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Never chase/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Scan New Invoice/i })).toBeVisible();
    await expect(page.locator('#stat-active')).toBeVisible();
  });

  test('load demo invoice opens preview and can start OCR stub', async ({ page }) => {
    await page.getByRole('button', { name: /Load Demo Invoice/i }).click();

    // Should open the scan modal with preview visible
    await expect(page.locator('#preview-area')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#preview-img')).toBeVisible();

    // The OCR button should be present (real OCR in Phase 2)
    await expect(page.getByRole('button', { name: /Extract Text with OCR/i })).toBeVisible();
  });

  test('navigating to invoices view works (via bottom nav + ?tab)', async ({ page }) => {
    await page.goto('/?tab=invoices');
    await expect(page.locator('#invoices-view')).toBeVisible();
    await expect(page.locator('#invoices-list')).toBeVisible();
  });

  test('settings modal opens and can save business name', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#settings-modal')).toBeVisible();

    const businessInput = page.locator('#settings-business');
    await businessInput.fill('Test Business LLC');
    await page.getByRole('button', { name: 'Save Settings' }).click();

    // Toast should appear
    await expect(page.locator('.toast')).toContainText(/saved/i, { timeout: 2000 });
  });
});
