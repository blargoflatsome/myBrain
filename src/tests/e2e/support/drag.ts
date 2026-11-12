import type { Locator, Page } from '@playwright/test'

/**
 * Drag a list item by its handle to just above or below another item, moving in small steps like a person would
 * (SortableJS reacts to the pointer as it moves).
 */
export async function dragHandle(page: Page, handle: Locator, target: Locator, where: 'above' | 'below') {
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  const x = from.x + from.width / 2
  const startY = from.y + from.height / 2
  const endY = where === 'above' ? to.y - 6 : to.y + to.height + 6
  await page.mouse.move(x, startY)
  await page.mouse.down()
  for (let step = 1; step <= 15; step++) {
    await page.mouse.move(x, startY + ((endY - startY) * step) / 15)
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(200)
  await page.mouse.up()
}
