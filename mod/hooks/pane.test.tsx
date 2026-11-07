import { expect, mock, test } from 'claude-code/testing'
import type { On, UiPane } from 'claude-code'

import { BAND, CACHE, PANE, STACK, pr, repo, seed } from './fixtures'
import { lines } from './shown'

const FORKED = repo({
  gtState: {
    ...STACK,
    env: { parent: 'ports', isTrunk: false, needsRestack: false },
    snapshot: { parent: 'fixtures', isTrunk: false, needsRestack: false },
  },
  prCache: {
    byBranch: {
      ...CACHE,
      env: pr(304, 'draft', 'Try ports via env instead'),
      snapshot: pr(305, 'open', 'Fixtures from a prod snapshot'),
    },
    mtimeMs: 0,
  },
})

// the host's panes: what $.ui.open and $.ui.close leave open
function panes(on: On, open: UiPane[] = []) {
  on('ui.open', (_, e) => {
    open.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: true })
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    open.splice(0, open.length, ...open.filter(p => p.id !== e.id))
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...open] }))

  return open
}

const toggle = (ui: { press: (t: { key: string; link: { href: string } }) => Promise<unknown> }) =>
  ui.press({ key: 'stack', link: { href: 'https://stack.invalid/' } })
const trunkRow = async (ui: { drawn: () => Promise<unknown> }) => lines(await ui.drawn()).at(-1)

test('◨ Stack (n) shows only when the ladder hides branches', async ($, on) => {
  seed(on, repo())
  const ui = await $.ui.mount(BAND)

  expect(await trunkRow(ui)).toBe('‹/› ┴ main')
  await ui.unmount()
})

test('◨ Stack (n) opens the Stack pane and ◧ closes it', async ($, on) => {
  seed(on, FORKED)
  const open = panes(on)
  const ui = await $.ui.mount(BAND)

  expect(await trunkRow(ui)).toBe('‹/› ┴ main ◨ Stack (7)')
  await toggle(ui)
  expect(open.map(p => [p.id, p.title])).toEqual([['jake-opener-stack', 'Stack']])
  expect(await trunkRow(ui)).toBe('‹/› ┴ main ◧ Stack (7)')
  await toggle(ui)
  expect(open).toEqual([])
  expect(await trunkRow(ui)).toBe('‹/› ┴ main ◨ Stack (7)')
  await ui.unmount()
})

test('the toggle follows a pane a reload left open', async ($, on) => {
  seed(on, FORKED)
  mock.clock(on)
  const open = panes(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const ui = await $.ui.mount(BAND)

  expect(await trunkRow(ui)).toBe('‹/› ┴ main ◨ Stack (7)')
  open.push({ id: 'jake-opener-stack', title: 'Stack', isShown: true, isFocused: false, isPlaced: true })
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  expect(await trunkRow(ui)).toBe('‹/› ┴ main ◧ Stack (7)')
  await ui.unmount()
})

test('the pane draws the whole Stack as a tree from trunk, with GitHub and Graphite links', async ($, on) => {
  seed(on, FORKED)
  const ui = await $.ui.mount(PANE)

  expect(lines(await ui.drawn())).toEqual([
    'main',
    '● Split settings into sections GitHub [Graphite]#295',
    '● Add worktree dev databases GitHub [Graphite]#297',
    '● Give each worktree its own ports GitHub [Graphite]#298',
    '◯ Seed per-worktree fixtures GitHub [Graphite]#300',
    '● Session cookie per worktree GitHub [Graphite]#301',
    '● Fixtures from a prod snapshot GitHub [Graphite]#305',
    '◯ Try ports via env instead GitHub [Graphite]#304',
  ])
  const depth = async (branch: string) => (await ui.find({ key: `pane-${branch}` }))?.props.paddingLeft
  expect([await depth('split'), await depth('ports'), await depth('cookie'), await depth('snapshot'), await depth('env')]).toEqual([
    2, 6, 10, 10, 8,
  ])
  expect((await ui.find({ key: 'pane-ports' }))?.props.backgroundColor).toBe('promptBorder')
  expect((await ui.findAll({ type: 'Link' })).slice(0, 2).map(l => l.props.href)).toEqual([
    'https://github.com/bravely/demarest_mays/pull/295',
    'https://app.graphite.com/github/pr/bravely/demarest_mays/295',
  ])
  await ui.unmount()
})

test('the pane says so outside a Stack', async ($, on) => {
  seed(on, repo({ branch: 'main' }))
  const ui = await $.ui.mount(PANE)

  expect(lines(await ui.drawn())).toEqual(['Not in a Stack.'])
  await ui.unmount()
})
