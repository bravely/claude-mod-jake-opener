import { expect, test } from 'claude-code/testing'

import { BAND, CACHE, STACK, pr, repo, seed } from './fixtures'
import { lines } from './shown'

const LADDER = [
  '● [Graphite]#301 Session cookie per worktree ↻ restack',
  '◯ [Graphite]#300 Seed per-worktree fixtures',
  '‹/› ● [Graphite]#298 Give each worktree its own ports',
  '● [Graphite]#297 Add worktree dev databases',
  '● [Graphite]#295 Split settings into sections',
  '‹/› ┴ main',
]

test('the ladder runs from the top of the Stack down to trunk, every row shown', async ($, on) => {
  seed(on, repo())
  const ui = await $.ui.mount(BAND)

  expect(lines(await ui.drawn())).toEqual(LADDER)
  expect((await ui.find({ key: 'row-ports' }))?.props.backgroundColor).toBe('promptBorder')
  expect((await ui.find({ key: 'row-databases' }))?.props.backgroundColor).toBeUndefined()
  await ui.unmount()
})

const FORKED = {
  ...STACK,
  env: { parent: 'ports', isTrunk: false, needsRestack: false },
  snapshot: { parent: 'fixtures', isTrunk: false, needsRestack: false },
}
const FORKED_CACHE = {
  ...CACHE,
  env: pr(304, 'draft', 'Try ports via env instead'),
  snapshot: pr(305, 'open', 'Fixtures from a prod snapshot'),
}

test('a fork shows one branch at a time, and stepping it swaps that row and everything above', async ($, on) => {
  seed(on, repo({ gtState: FORKED, prCache: { byBranch: FORKED_CACHE, mtimeMs: 0 } }))
  const ui = await $.ui.mount(BAND)

  expect(lines(await ui.drawn())).toEqual([
    '⑂ 1/2 ● [Graphite]#301 Session cookie per worktree ↻ restack',
    '⑂ 1/2 ◯ [Graphite]#300 Seed per-worktree fixtures',
    '‹/› ● [Graphite]#298 Give each worktree its own ports',
    '● [Graphite]#297 Add worktree dev databases',
    '● [Graphite]#295 Split settings into sections',
    '‹/› ┴ main',
  ])

  await ui.press({ key: 'fork-ports', link: { href: 'https://fork.invalid/ports' } })
  expect(lines(await ui.drawn()).slice(0, 2)).toEqual([
    '⑂ 2/2 ◯ [Graphite]#304 Try ports via env instead',
    '‹/› ● [Graphite]#298 Give each worktree its own ports',
  ])

  await ui.press({ key: 'fork-ports', link: { href: 'https://fork.invalid/ports' } })
  await ui.press({ key: 'fork-fixtures', link: { href: 'https://fork.invalid/fixtures' } })
  expect(lines(await ui.drawn()).slice(0, 2)).toEqual([
    '⑂ 2/2 ● [Graphite]#305 Fixtures from a prod snapshot',
    '⑂ 1/2 ◯ [Graphite]#300 Seed per-worktree fixtures',
  ])
  await ui.unmount()

  const again = await $.ui.mount(BAND)
  expect(lines(await again.drawn())[0]).toBe('⑂ 2/2 ● [Graphite]#305 Fixtures from a prod snapshot')
  await again.unmount()
})

test('rail PRs outside the Stack sit above the ladder behind a rule, each once', async ($, on) => {
  const other = pr(12, 'open', undefined, 'gtprobe-scratch')
  seed(
    on,
    repo({
      rail: { pr: { ...CACHE.ports!, head: 'ports' }, others: [other, other, pr(297, 'open')] },
      ghPrs: { byBranch: {}, titles: {} },
    }),
  )
  const ui = await $.ui.mount(BAND)

  expect(lines(await ui.drawn())).toEqual([
    '● [Graphite]#12 bravely/gtprobe-scratch#12',
    '──────────',
    ...LADDER,
  ])
  await ui.unmount()
})

const cases = [
  {
    name: '1, on trunk',
    snapshot: repo({ branch: 'main' }),
    band: ['‹/› ┴ main(trunk) · gt create to start a Stack'],
  },
  {
    name: '2, a branch gt does not track, with a PR from gh',
    snapshot: repo({
      branch: 'jake/scratch',
      ghPrs: { byBranch: { 'jake/scratch': pr(310, 'open', 'Scratch: try a new seed script') }, titles: {} },
    }),
    band: ['‹/› ● [Graphite]#310 Scratch: try a new seed script · not tracked gt track', '‹/› ┴ main'],
  },
  {
    name: '2, a branch gt does not track, with no PR',
    snapshot: repo({ branch: 'jake/scratch' }),
    band: ['‹/› ◌ no PR jake/scratch · not tracked gt track', '‹/› ┴ main'],
  },
  {
    name: '3, detached HEAD',
    snapshot: repo({ branch: 'HEAD' }),
    band: ['‹/› ◌ detached at 1e806cb'],
  },
  {
    name: '4, a rebase stopped on a conflict',
    snapshot: repo({ branch: 'HEAD', rebase: 'ports' }),
    band: [
      ...LADDER.slice(0, 2),
      '‹/› ● [Graphite]#298 Give each worktree its own ports · rebase stopped on a conflict fix it',
      ...LADDER.slice(3),
    ],
  },
  {
    name: '5, gt not initialised',
    snapshot: repo({
      branch: 'feature',
      gtState: {},
      gtInitialised: false,
      prCache: undefined,
      ghPrs: { byBranch: { feature: pr(312, 'open', 'Add CSV export') }, titles: {} },
    }),
    band: ['‹/› ● [Graphite]#312 Add CSV export', '‹/› ┴ main · gt not initialised here gt init'],
  },
  {
    name: '5b, gt not installed',
    snapshot: repo({ branch: 'feature', gtState: {}, gtInitialised: false, gtInstalled: false }),
    band: ['‹/› ◌ no PR feature', '‹/› ┴ main · gt not installed'],
  },
  {
    name: '6, not a git repo',
    snapshot: { cwd: '/Users/bravely/Downloads/notes', topLevel: null },
    band: ['‹/› /Users/bravely/Downloads/notes'],
  },
  {
    name: '7, a merged PR in the Stack not yet synced',
    snapshot: repo({
      gtState: { ...STACK, databases: { parent: 'split', isTrunk: false, needsRestack: true } },
      prCache: { byBranch: { ...CACHE, split: pr(295, 'merged', 'Split settings into sections') }, mtimeMs: 0 },
    }),
    band: [
      ...LADDER.slice(0, 3),
      '● [Graphite]#297 Add worktree dev databases ↻ restack',
      '✓ [Graphite]#295 Split settings into sections gt sync',
      '‹/› ┴ main',
    ],
  },
  {
    name: '8, a closed PR in the Stack',
    snapshot: repo({
      gtState: { ...STACK, databases: { parent: 'split', isTrunk: false, needsRestack: true } },
      prCache: { byBranch: { ...CACHE, databases: pr(297, 'closed', 'Add worktree dev databases') }, mtimeMs: 0 },
    }),
    band: [...LADDER.slice(0, 3), '✕ [Graphite]#297 Add worktree dev databases', ...LADDER.slice(4)],
  },
  {
    name: '9, a PR gt has not cached while gh answers',
    snapshot: repo({ prCache: { byBranch: { ...CACHE, fixtures: undefined! }, mtimeMs: 0 }, ghPrs: undefined }),
    band: [LADDER[0]!, '◌ PR … fixtures', ...LADDER.slice(2)],
  },
  {
    name: '9, a branch gh says has no PR',
    snapshot: repo({ prCache: { byBranch: { ...CACHE, fixtures: undefined! }, mtimeMs: 0 } }),
    band: [LADDER[0]!, '◌ no PR fixtures', ...LADDER.slice(2)],
  },
  {
    name: '9, gh failing',
    snapshot: repo({
      prCache: { byBranch: { ...CACHE, fixtures: undefined! }, mtimeMs: 0 },
      ghPrs: { byBranch: {}, titles: {}, error: 'gh pr list failed: HTTP 401: Bad credentials' },
    }),
    band: [LADDER[0]!, '◌ PR ? fixtures · gh pr list failed: HTTP 401: Bad credentials', ...LADDER.slice(2)],
  },
  {
    name: "10, gt's cache missing",
    snapshot: repo({
      prCache: undefined,
      ghPrs: { byBranch: { ...CACHE }, titles: {} },
    }),
    band: LADDER,
  },
] as const

for (const c of cases) {
  test(`edge case ${c.name}`, async ($, on) => {
    seed(on, c.snapshot)
    const ui = await $.ui.mount(BAND)

    expect(lines(await ui.drawn())).toEqual([...c.band])
    await ui.unmount()
  })
}

test('a problem turns the current row soft red, and a gone PR is struck through', async ($, on) => {
  seed(
    on,
    repo({
      branch: 'HEAD',
      rebase: 'ports',
      prCache: { byBranch: { ...CACHE, split: pr(295, 'merged', 'Split settings into sections') }, mtimeMs: 0 },
    }),
  )
  const ui = await $.ui.mount(BAND)

  expect((await ui.find({ key: 'row-ports' }))?.props.backgroundColor).toBe('diffRemovedDimmed')
  expect((await ui.find({ type: 'Text', text: 'Split settings into sections' }))?.props).toMatchObject({
    strikethrough: true,
    dimColor: true,
  })
  expect((await ui.find({ type: 'Text', text: /rebase stopped/ }))?.props.color).toBe('error')
  await ui.unmount()
})

test('fix it drafts a request to resolve the conflict, unsent', async ($, on) => {
  seed(on, repo({ branch: 'HEAD', rebase: 'ports' }))
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  const ui = await $.ui.mount(BAND)

  await ui.press({ key: 'fix-ports', link: { href: 'https://fix.invalid/ports' } })
  expect(filled).toEqual([
    'The restack of ports stopped on a conflict. Resolve the conflict and continue the restack.',
  ])
  await ui.unmount()
})

test('the band yields to a survey and to every surface but the desktop', async ($, on) => {
  seed(on, repo())
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const mount of [
    { ...BAND, props: { ...BAND.props, hasSurvey: true } },
    { ...BAND, surface: 'terminal' },
  ] as const) {
    const ui = await $.ui.mount(mount)
    expect(lines(await ui.drawn())).toEqual(['engine'])
    await ui.unmount()
  }
})
