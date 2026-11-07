import { expect, mock, test } from 'claude-code/testing'

import { BAND, CACHE, STACK, host, pr, repo, seed } from './fixtures'
import { lines } from './shown'

const TOP = '/Users/bravely/dev/demarest_mays/.claude/worktrees/ports'

const press = (ui: { press: (t: { key: string; link: { href: string } }) => Promise<unknown> }, link: string, row: string) =>
  ui.press({ key: `${link}-${row}`, link: { href: `https://${link}.invalid/${encodeURIComponent(row)}` } })

test('gt track runs in the worktree with trunk as the parent, and is silent when it works', async ($, on) => {
  seed(on, repo({ branch: 'jake/scratch' }))
  mock.clock(on)
  const { runs, dirs, toasts } = host(on)
  const ui = await $.ui.mount(BAND)

  await press(ui, 'track', 'jake/scratch')
  expect(runs).toEqual([['gt', 'track', '--parent', 'main', '--no-interactive']])
  expect(dirs).toEqual([TOP])
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('gt init offers the trunk origin/HEAD names', async ($, on) => {
  seed(on, repo({ branch: 'feature', gtState: {}, gtInitialised: false }))
  mock.clock(on)
  const { runs } = host(on)
  const ui = await $.ui.mount(BAND)

  await press(ui, 'init', 'trunk')
  expect(runs).toEqual([['gt', 'init', '--trunk', 'main', '--no-interactive']])
  await ui.unmount()
})

test('a restack that hits a conflict says so', async ($, on) => {
  seed(on, repo())
  mock.clock(on)
  const { runs, toasts } = host(on, () => ({
    exitCode: 1,
    stdout: 'Hit conflict restacking cookie on fixtures.\nUnmerged files:\n  src/cookie.ts\n',
  }))
  const ui = await $.ui.mount(BAND)

  await press(ui, 'restack', 'cookie')
  expect(runs).toEqual([['gt', 'restack', '--no-interactive']])
  expect(toasts).toEqual(['restack stopped on a conflict'])
  await ui.unmount()
})

test("a failed command toasts gt's first error line, else its last line", async ($, on) => {
  seed(on, repo({ prCache: { byBranch: { ...CACHE, split: pr(295, 'merged', 'Split settings') }, mtimeMs: 0 } }))
  mock.clock(on)
  const answers = [
    { exitCode: 1, stderr: 'Pulling main\nERROR: Graphite encountered a 404 Not Found error when querying GitHub.\nRetry later.\n' },
    { exitCode: 1, stdout: 'Checking out main\n\nsomething went wrong\n\n' },
  ]
  const { runs, toasts } = host(on, () => answers.shift()!)
  const ui = await $.ui.mount(BAND)

  await press(ui, 'sync', 'split')
  await press(ui, 'sync', 'split')
  expect(runs).toEqual([
    ['gt', 'sync', '--no-interactive'],
    ['gt', 'sync', '--no-interactive'],
  ])
  expect(toasts).toEqual([
    'gt sync failed: ERROR: Graphite encountered a 404 Not Found error when querying GitHub.',
    'gt sync failed: something went wrong',
  ])
  await ui.unmount()
})

test('while a command runs its row says running… and no band link can be pressed', async ($, on) => {
  seed(on, repo({ gtState: { ...STACK, databases: { parent: 'split', isTrunk: false, needsRestack: true } } }))
  mock.clock(on)
  let finish = () => {}
  let started = () => {}
  const isRunning = new Promise<void>(resolve => (started = resolve))
  on('process.run', async () => {
    started()
    await new Promise<void>(resolve => (finish = resolve))
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const ui = await $.ui.mount(BAND)

  const pressing = press(ui, 'restack', 'databases')
  await isRunning
  expect(lines(await ui.drawn())).toContain('● [Graphite]#297 Add worktree dev databases ↻ restack running…')
  expect(await ui.findAll({ type: 'Markdown' })).toEqual([])
  finish()
  await pressing
  expect(lines(await ui.drawn())).toContain('● [Graphite]#297 Add worktree dev databases ↻ restack')
  expect((await ui.findAll({ type: 'Markdown' })).length).toBeGreaterThan(0)
  await ui.unmount()
})

test('the next prompt tells the model what the band ran, once', async ($, on) => {
  seed(on, repo({ branch: 'jake/scratch' }))
  mock.clock(on)
  host(on, () => ({ exitCode: 0, stdout: 'Tracked branch jake/scratch with parent main (includes 1 commit).\n' }))
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text, context: e.context }
  })
  const ui = await $.ui.mount(BAND)

  await press(ui, 'track', 'jake/scratch')
  const typed = { origin: { kind: 'composer' }, wait: false } as const
  await $.prompt.submit({ text: 'what changed?', ...typed })
  await $.prompt.submit({ text: 'and now?', ...typed })
  expect(contexts).toEqual([
    [
      `The Openers band ran \`gt track --parent main --no-interactive\` in ${TOP}: exit 0. Tracked branch jake/scratch with parent main (includes 1 commit).`,
    ],
    undefined,
  ])
  await ui.unmount()
})
