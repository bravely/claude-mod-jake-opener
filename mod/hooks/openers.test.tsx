import { expect, mock, test } from 'claude-code/testing'

import { BAND, host, repo, seed } from './fixtures'
import { OPENERS } from './openers'

const TOP = '/Users/bravely/dev/demarest_mays/.claude/worktrees/ports'
const TRUNK = '/Users/bravely/dev/demarest_mays'

test('the editor Openers resolve to the worktree, or the folder outside a repo, and to trunk', async () => {
  expect(OPENERS.worktreeEditor.resolve(repo())).toEqual({ kind: 'directory', path: TOP })
  expect(OPENERS.worktreeEditor.resolve({ cwd: '/tmp/notes', topLevel: null })).toEqual({
    kind: 'directory',
    path: '/tmp/notes',
  })
  expect(OPENERS.trunkEditor.resolve(repo())).toEqual({ kind: 'directory', path: TRUNK })
  expect(OPENERS.trunkEditor.resolve(repo({ trunkWorktree: undefined }))).toBeUndefined()
})

test('the Graphite Opener resolves only for a PR', async () => {
  const ref = { owner: 'bravely', repo: 'demarest_mays', number: 298 }
  expect(OPENERS.graphite.resolve(repo(), ref)).toEqual({
    kind: 'url',
    url: 'https://app.graphite.com/github/pr/bravely/demarest_mays/298',
  })
  expect(OPENERS.graphite.resolve(repo())).toBeUndefined()
})

const pressEditor = (ui: { press: (t: { key: string; link: { href: string } }) => Promise<unknown> }, which: string) =>
  ui.press({ key: `editor-${which}`, link: { href: `https://editor.invalid/${which}` } })

test('‹/› opens the worktree in $EDITOR, without --wait, and stays silent when it opens', async ($, on) => {
  seed(on, repo())
  mock.env(on, { EDITOR: 'code-insiders --wait' })
  const { runs, toasts } = host(on)
  const ui = await $.ui.mount(BAND)

  await pressEditor(ui, 'worktree')
  await pressEditor(ui, 'trunk')
  expect(runs).toEqual([
    ['code-insiders', TOP],
    ['code-insiders', TRUNK],
  ])
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('a failed open toasts with the Opener label', async ($, on) => {
  seed(on, repo())
  mock.env(on, { VISUAL: 'code-insiders' })
  const { toasts } = host(on, () => ({ exitCode: 1 }))
  const ui = await $.ui.mount(BAND)

  await pressEditor(ui, 'trunk')
  expect(toasts).toEqual(["Couldn't open Trunk editor: code-insiders exited 1"])
  await ui.unmount()
})

test('trunk ‹/› with no worktree on trunk says so', async ($, on) => {
  seed(on, repo({ trunkWorktree: undefined }))
  mock.env(on, { EDITOR: 'code-insiders' })
  const { runs, toasts } = host(on)
  const ui = await $.ui.mount(BAND)

  await pressEditor(ui, 'trunk')
  expect(runs).toEqual([])
  expect(toasts).toEqual(['No worktree has main checked out'])
  await ui.unmount()
})

test('with no editor in the env, a login shell is asked once and its answer kept', async ($, on) => {
  seed(on, repo())
  mock.env(on, { SHELL: '/bin/zsh' })
  const { runs } = host(on, argv =>
    argv[0] === '/bin/zsh' ? { exitCode: 0, stdout: 'code-insiders -w' } : { exitCode: 0 },
  )
  const ui = await $.ui.mount(BAND)

  await pressEditor(ui, 'worktree')
  await pressEditor(ui, 'worktree')
  expect(runs).toEqual([
    ['/bin/zsh', '-ic', 'printf %s "${VISUAL:-$EDITOR}"'],
    ['code-insiders', TOP],
    ['code-insiders', TOP],
  ])
  await ui.unmount()
})
