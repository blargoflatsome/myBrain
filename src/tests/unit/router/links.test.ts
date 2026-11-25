import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/router/index'
import { linkedId, linkTo, type ItemLink, type LinkedKind } from '@/router/links'

const router = createRouter({ history: createMemoryHistory(), routes })

describe('SPEC §5 Global search and alerts: a link opens its item', () => {
  it.each([
    [{ kind: 'task', id: 't1' }, 'tasks'],
    [{ kind: 'habit', id: 'h1' }, 'habits'],
    [{ kind: 'routine', id: 'r1' }, 'routines'],
    [{ kind: 'quest', id: 'q1' }, 'quests'],
    [{ kind: 'event', id: 'e1', date: '2026-11-10' }, 'calendar'],
    [{ kind: 'vault_item', id: 'v1', bucket: 'b1' }, 'vault'],
  ] as [ItemLink & { kind: LinkedKind; id: string }, string][])('%o goes to its page and names the same item', (link, page) => {
    const to = router.resolve(linkTo(link))
    expect(to.name).toBe(page)
    expect(linkedId(link.kind, to.query)).toBe(link.id)
  })

  it.each([
    ['/calendar?event=e1', 'calendar', 'event', 'e1'],
    ['/tasks?task=t1', 'tasks', 'task', 't1'],
  ] as const)('the server’s links (alerts, pushes) read the same way: %s', (path, page, kind, id) => {
    const to = router.resolve(path)
    expect(to.name).toBe(page)
    expect(linkedId(kind, to.query)).toBe(id)
  })

  it('a day or a bucket from the server opens where the app’s own links do', () => {
    expect(router.resolve('/calendar?date=2026-11-10').fullPath).toBe(router.resolve(linkTo({ kind: 'day', date: '2026-11-10' })).fullPath)
    expect(router.resolve('/vault?bucket=b1').fullPath).toBe(router.resolve(linkTo({ kind: 'bucket', bucket: 'b1' })).fullPath)
  })
})
