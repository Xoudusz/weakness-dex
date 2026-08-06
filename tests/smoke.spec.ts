import { test, expect } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#inp')).toBeVisible()
})

test('search input accepts text', async ({ page }) => {
  await page.goto('/')
  const input = page.locator('#inp')
  await input.fill('pikachu')
  await expect(input).toHaveValue('pikachu')
})

test('dropdown appears on input', async ({ page }) => {
  await page.goto('/')
  await page.locator('#inp').fill('char')
  const dropdown = page.locator('#dropdown')
  await expect(dropdown).not.toBeEmpty()
})

test('advanced panel toggles', async ({ page }) => {
  await page.goto('/')
  const panel = page.locator('#adv-panel')
  await expect(panel).not.toBeVisible()
  await page.locator('#adv-btn').click()
  await expect(panel).toBeVisible()
})
