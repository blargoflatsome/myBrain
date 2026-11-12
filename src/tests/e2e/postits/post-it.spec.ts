import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isPhone } from '../support/devices'
import { goTo } from '../support/nav'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const lastWrite = (table: string) => server.written(table).at(-1)
const board = (page: Page) => page.getByTestId('postit')

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Post It', () => {
  test('Capture has a Post It: a small formatted note and a color; it goes to the top of the Dashboard', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('group', { name: msg.capture.typeHeading }).getByRole('button', { name: msg.postIts.label, exact: true }).click()
    const editor = page.getByRole('textbox', { name: msg.postIts.label })
    await expect(editor).toBeFocused()
    await page.getByRole('toolbar', { name: 'Formatting: Post It' }).getByRole('button', { name: msg.editor.bold }).click()
    await page.keyboard.type('Call the vet')
    await page.getByRole('radiogroup', { name: msg.postIts.color }).getByRole('radio', { name: /Blue/ }).click()
    await page.getByRole('button', { name: msg.capture.save, exact: true }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.postit)
    await expect.poll(() => lastWrite('post_its')).toMatchObject({ body: '<p><strong>Call the vet</strong></p>', color: 'blue' })

    await goTo(page, 'Dashboard')
    await expect(board(page)).toHaveCount(1)
    await expect(board(page).locator('strong')).toHaveText('Call the vet')
    await expect(board(page)).toHaveClass(/note-blue/)
    await expect(page.locator('main section').first()).toHaveAttribute('data-testid', 'dash-postits')
  })

  test('an empty Post It is not saved', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('group', { name: msg.capture.typeHeading }).getByRole('button', { name: msg.postIts.label, exact: true }).click()
    await page.getByRole('button', { name: msg.capture.save, exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText(msg.postIts.emptyError)
    expect(server.written('post_its')).toHaveLength(0)
  })

  test('several Post Its are a stack showing one at a time, newest on top; with none there is no Post It section', async ({ page }, info) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    await expect(page.getByTestId('dash-postits')).toHaveCount(0)
    server.seed('post_its', [
      { id: 'p1', body: '<p>Older</p>', color: 'yellow', position: 0 },
      { id: 'p2', body: '<p>Newer</p>', color: 'blue', position: -1 },
    ])
    await page.reload()
    const carousel = page.getByRole('region', { name: msg.postIts.heading })
    await expect(carousel).toHaveAttribute('aria-roledescription', 'carousel')
    await expect(board(page)).toHaveCount(1)
    await expect(board(page).getByTestId('postit-body')).toHaveText('Newer')
    // Notes stay newest first: there is no reordering.
    await expect(page.getByRole('button', { name: /Move (earlier|later)/ })).toHaveCount(0)

    if (isPhone(info)) {
      // Phone: no Previous / Next; a dot per note, tap one to show it.
      await expect(page.getByRole('button', { name: msg.pages.previous })).toBeHidden()
      await expect(page.getByRole('button', { name: msg.pages.next })).toBeHidden()
      const dots = page.getByTestId('postit-dots').getByRole('button')
      await expect(dots).toHaveCount(2)
      await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true')
      await page.getByRole('button', { name: 'Show Post It 2 of 2' }).click()
      await expect(board(page).getByTestId('postit-body')).toHaveText('Older')
      await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true')
      await expect(page.getByTestId('postit-announcement')).toHaveText('2 of 2')
    } else {
      // Computer: arrows either side of the stack (none past either end), "1 of 2" below; no dots.
      await expect(page.getByTestId('postit-dots')).toBeHidden()
      await expect(page.getByTestId('postit-count')).toHaveText('1 of 2')
      await expect(page.getByRole('button', { name: msg.pages.previous })).toHaveCount(0)
      await page.getByRole('button', { name: msg.pages.next }).click()
      await expect(board(page).getByTestId('postit-body')).toHaveText('Older')
      await expect(page.getByTestId('postit-count')).toHaveText('2 of 2')
      await expect(page.getByTestId('postit-announcement')).toHaveText('2 of 2')
      await expect(page.getByRole('button', { name: msg.pages.next })).toHaveCount(0)
      // The arrow that went away hands focus to the other one, so the keyboard isn't lost.
      await expect(page.getByRole('button', { name: msg.pages.previous })).toBeFocused()
      // The left and right arrow keys flip through the stack too.
      await page.keyboard.press('ArrowLeft')
      await expect(board(page).getByTestId('postit-body')).toHaveText('Newer')
      await expect(page.getByRole('button', { name: msg.pages.next })).toBeFocused()
      await page.keyboard.press('ArrowRight')
      await expect(board(page).getByTestId('postit-body')).toHaveText('Older')
    }
  })


  test('on a touch screen, swiping left and right flips through the stack', async ({ page }, info) => {
    test.skip(info.project.name !== 'android-phone', 'real touch input runs on the phone')
    server.seed('post_its', [
      { id: 'p1', body: '<p>Top</p>', color: 'yellow', position: 0 },
      { id: 'p2', body: '<p>Next one</p>', color: 'pink', position: 1 },
    ])
    await open(page, '/')
    await expect(board(page).getByTestId('postit-body')).toHaveText('Top')
    const box = (await page.locator('.postit-stack').boundingBox())!
    const y = box.y + box.height / 2
    // A real finger swipe (touch start, several moves, touch end), the way a phone sends it.
    const cdp = await page.context().newCDPSession(page)
    const swipe = async (fromX: number, toX: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] })
      for (let k = 1; k <= 8; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * k) / 8, y: y + k }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    await swipe(box.x + box.width * 0.8, box.x + box.width * 0.2)
    await expect(board(page).getByTestId('postit-body')).toHaveText('Next one')
    await swipe(box.x + box.width * 0.2, box.x + box.width * 0.8)
    await expect(board(page).getByTestId('postit-body')).toHaveText('Top')
  })


  test('on a computer the arrows sit beside the stack and appear on mouse over or keyboard focus', async ({ page }, info) => {
    test.skip(isPhone(info), 'computer only')
    server.seed('post_its', [
      { id: 'p1', body: '<p>Top</p>', color: 'yellow', position: 0 },
      { id: 'p2', body: '<p>Next one</p>', color: 'pink', position: 1 },
    ])
    await open(page, '/')
    const next = page.getByRole('button', { name: msg.pages.next })
    const opacity = () => next.evaluate((el) => getComputedStyle(el).opacity)
    await page.mouse.move(5, 5)
    await expect.poll(opacity).toBe('0')
    // Beside the stack, level with it.
    const stack = (await page.locator('.postit-stack').boundingBox())!
    const arrow = (await next.boundingBox())!
    expect(arrow.x).toBeGreaterThan(stack.x + stack.width)
    expect(arrow.y).toBeGreaterThan(stack.y)
    expect(arrow.y + arrow.height).toBeLessThan(stack.y + stack.height)
    await page.locator('.postit-stack').hover()
    await expect.poll(opacity).toBe('1')
    await page.mouse.move(5, 5)
    await expect.poll(opacity).toBe('0')
    await next.focus()
    await expect.poll(opacity).toBe('1')
  })

  test('it looks taped to the page: a strip of tape, a tilt, and the notes underneath peeking out', async ({ page }) => {
    server.seed('post_its', [
      { id: 'p1', body: '<p>Top</p>', color: 'yellow', position: 0 },
      { id: 'p2', body: '<p>Under</p>', color: 'pink', position: 1 },
      { id: 'p3', body: '<p>Bottom</p>', color: 'blue', position: 2 },
    ])
    await open(page, '/')
    await expect(board(page).locator('.postit-tape')).toHaveCount(1)
    await expect(board(page)).toHaveClass(/postit-tilt/)
    const under = page.locator('.postit-under')
    await expect(under).toHaveCount(2)
    await expect(under.nth(0)).toHaveClass(/note-pink/)
    await expect(under.nth(1)).toHaveClass(/note-blue/)
  })

  test('a Post It can be edited in place, including its color', async ({ page }) => {
    server.seed('post_its', [{ id: 'p1', body: '<p>Buy stamps</p>', color: 'yellow', position: 0 }])
    await open(page, '/')
    await board(page).getByRole('button', { name: msg.postIts.edit }).click()
    const editor = board(page).getByRole('textbox', { name: 'Post It 1' })
    await expect(editor).toBeFocused()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(' and envelopes')
    await board(page).getByRole('radio', { name: /Green/ }).click()
    await board(page).getByRole('button', { name: msg.capture.save }).click()
    await expect(board(page).getByTestId('postit-body')).toHaveText('Buy stamps and envelopes')
    await expect.poll(() => lastWrite('post_its')).toMatchObject({ id: 'p1', body: '<p>Buy stamps and envelopes</p>', color: 'green' })
    await expect(board(page).getByRole('button', { name: msg.postIts.edit })).toBeFocused()
  })

  test('the X in the top right corner deletes it straight away, and Undo puts it back', async ({ page }) => {
    server.seed('post_its', [{ id: 'p1', body: '<p>Buy stamps</p>', color: 'yellow', position: 0 }])
    await open(page, '/')
    await board(page).getByRole('button', { name: msg.postIts.delete }).click()
    await expect(board(page)).toHaveCount(0)
    await expect(page.getByTestId('postit-notice')).toContainText(msg.postIts.removed)
    await expect.poll(() => lastWrite('post_its')).toMatchObject({ id: 'p1', deleted_at: expect.any(String) })
    await page.getByRole('button', { name: msg.undo.undo }).click()
    await expect(board(page)).toHaveCount(1)
    await expect.poll(() => lastWrite('post_its')).toMatchObject({ id: 'p1', deleted_at: null })
  })

  test('on the note: an X in the top right corner and an edit icon in the bottom left; no Make a task', async ({ page }) => {
    server.seed('post_its', [{ id: 'p1', body: '<p>Buy stamps</p>', color: 'yellow', position: 0 }])
    await open(page, '/')
    const note = (await board(page).boundingBox())!
    const x = (await board(page).getByRole('button', { name: msg.postIts.delete }).boundingBox())!
    const pencil = (await board(page).getByRole('button', { name: msg.postIts.edit }).boundingBox())!
    expect(x.x + x.width).toBeGreaterThan(note.x + note.width - 30)
    expect(x.y).toBeLessThan(note.y + 30)
    expect(pencil.x).toBeLessThan(note.x + 30)
    expect(pencil.y + pencil.height).toBeGreaterThan(note.y + note.height - 40)
    for (const box of [x, pencil]) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('button', { name: /Make a task|^Done$/ })).toHaveCount(0)
  })

})

test('Pink is no longer offered, but an older pink note still shows pink', async ({ page }) => {
  server.seed('post_its', [{ id: 'p-old', body: '<p>From before</p>', color: 'pink', position: 0 }])
  await page.goto('/capture')
  await page.getByRole('button', { name: msg.postIts.label, exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: msg.postIts.color }).getByRole('radio')).toHaveText([/Yellow/, /Blue/, /Green/])
  await page.goto('/')
  await expect(page.locator('.note-pink').first()).toBeVisible()
})
