import { test, expect } from '@playwright/test'

/**
 * E2E test for per-transaction AI category undo (issue #76).
 *
 * Validates that clicking a category badge on an AI-categorized transaction
 * shows a "Revert to rule-based category" option, and that clicking it
 * removes the AI sparkle icon.
 */
test.describe('AI category undo in CategoryPickerDropdown', () => {
  test('shows "Revert to rule-based category" for AI-categorized transaction and reverts on click', async ({ page }) => {
    // Navigate to the transactions page
    await page.goto('/transactions')

    // Wait for the transaction table to render at least one row
    const tableRow = page.locator('table tbody tr').first()
    await expect(tableRow).toBeVisible({ timeout: 10_000 })

    // Read the first VISIBLE transaction id (first row on page 1, sorted date-desc)
    // The table sorts by date descending with 50 rows per page, so we find the
    // most-recent transaction to ensure it is rendered on page 1.
    const txId = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__store__
      if (!store) throw new Error('__store__ not exposed on window')
      const state = store.getState()
      const transactions: Array<{ id: string; category: string; date: string }> = state.transactions
      if (!transactions.length) throw new Error('No transactions loaded')

      // Pick the most recent transaction (first in date-desc sort = page 1 row 1)
      const sorted = [...transactions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      const tx = sorted[0]

      // Inject AI category for that transaction
      store.getState().setAiCategories({
        [tx.id]: {
          category: tx.category || 'shopping',
          confidence: 0.9,
          reasoning: 'E2E test injection',
          source: 'llm',
        },
      })
      return tx.id
    })

    expect(txId).toBeTruthy()

    // The AI sparkle icon should now appear on the badge for that transaction
    const sparkleBadge = page.locator('[aria-label="AI categorized"]').first()
    await expect(sparkleBadge).toBeVisible({ timeout: 5_000 })

    // Click the parent badge button to open the category picker
    await sparkleBadge.locator('..').click()

    // The "Revert to rule-based category" button must appear in the picker
    const revertButton = page.getByText('Revert to rule-based category')
    await expect(revertButton).toBeVisible()

    // The existing "Restore rule-based category" (for manual overrides) must NOT appear
    await expect(page.getByText('Restore rule-based category')).not.toBeVisible()

    // Click the revert button
    await revertButton.click()

    // The picker should close and the sparkle icon should be gone
    await expect(page.locator('[aria-label="AI categorized"]')).not.toBeVisible({ timeout: 5_000 })

    // Verify the AI category was removed from the store
    const aiCategories = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__store__
      return store.getState().aiCategories
    })
    expect(aiCategories).toEqual({})
  })

  test('does not show "Revert to rule-based category" for non-AI-categorized transaction', async ({ page }) => {
    await page.goto('/transactions')

    // Wait for rows
    const tableRow = page.locator('table tbody tr').first()
    await expect(tableRow).toBeVisible({ timeout: 10_000 })

    // Ensure no AI categories in the store
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__store__
      store.getState().clearAiCategories()
    })

    // No sparkle icon should be visible
    await expect(page.locator('[aria-label="AI categorized"]')).not.toBeVisible()

    // Click any category badge button (find one via the title attribute "change")
    const firstBadge = page.locator('table tbody tr').first()
      .locator('button[title*="change"]').first()
    await firstBadge.click()

    // The revert button should NOT appear
    await expect(page.getByText('Revert to rule-based category')).not.toBeVisible()
  })
})
