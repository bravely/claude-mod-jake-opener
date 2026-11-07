import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

import { BAND, NOW, host, type Ran } from './fixtures'
import { lines } from './shown'

const TOP = '/Users/bravely/dev/demarest_mays/.claude/worktrees/ports'
const COMMON = '/Users/bravely/dev/demarest_mays/.git'
const GIT_DIR = `${COMMON}/worktrees/ports`
const MINUTE = 60_000

const graphite = (n: number) => `https://app.graphite.com/github/pr/bravely/demarest_mays/${n}`
const github = (n: number, repo = 'demarest_mays') => `https://github.com/bravely/${repo}/pull/${n}`

const GT_STATE = {
  main: { trunk: true, needs_restack: false, parents: [] },
  split: { trunk: false, needs_restack: false, parents: [{ ref: 'main', sha: 'a1' }] },
  ports: { trunk: false, needs_restack: false, parents: [{ ref: 'split', sha: 'b2' }] },
  fixtures: { trunk: false, needs_restack: true, parents: [{ ref: 'ports', sha: 'c3' }] },
}
const PR_INFO = {
  prInfos: [
    { prNumber: 295, title: 'Split settings into sections', state: 'MERGED', isDraft: false, headRefName: 'split', url: graphite(295) },
    { prNumber: 298, title: 'Give each worktree its own ports', state: 'OPEN', isDraft: false, headRefName: 'ports', url: graphite(298) },
    { prNumber: 300, title: 'Seed per-worktree fixtures', state: 'OPEN', isDraft: true, headRefName: 'fixtures', url: graphite(300) },
  ],
}

// A repo as git, gt, gt's cache, ccd_pr and gh answer for it; change a field
// to change what the next refresh finds.
function fakeRepo(on: On, over: { cacheAgeMs?: number } = {}) {
  const repo = {
    branch: 'ports',
    gt: (): Ran | Promise<Ran> => ({ exitCode: 0, stdout: JSON.stringify(GT_STATE) }),
    prInfo: PR_INFO as { prInfos: Record<string, unknown>[] },
    gh: (): Ran => ({ exitCode: 0, stdout: '[]' }),
    surfaces: ['desktop'] as RenderSurface[],
  }
  const { runs, toasts } = host(on, argv => {
    const line = argv.join(' ')
    if (line === 'git rev-parse --path-format=absolute --git-common-dir --git-dir --show-toplevel') {
      return { exitCode: 0, stdout: `${COMMON}\n${GIT_DIR}\n${TOP}\n` }
    }
    if (line === 'git rev-parse --path-format=absolute --git-common-dir --git-dir') {
      return { exitCode: 0, stdout: `${COMMON}\n${GIT_DIR}\n` }
    }
    if (line === 'git rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: `${repo.branch}\n` }
    if (line === 'git rev-parse --short HEAD') return { exitCode: 0, stdout: '1e806cb\n' }
    if (line === 'git rev-parse --abbrev-ref origin/HEAD') return { exitCode: 0, stdout: 'origin/main\n' }
    if (line === 'git worktree list --porcelain') {
      return {
        exitCode: 0,
        stdout: `worktree /Users/bravely/dev/demarest_mays\nHEAD 0a0\nbranch refs/heads/main\n\nworktree ${TOP}\nHEAD 1e8\nbranch refs/heads/ports\n`,
      }
    }
    if (line === 'gt state --no-interactive') return repo.gt()
    if (line.startsWith('gh pr list')) return repo.gh()
    if (line === `gh pr view ${github(12, 'gtprobe-scratch')} --json title`) {
      return { exitCode: 0, stdout: '{"title":"Probe gt sync"}' }
    }
    return { exitCode: 1 }
  })
  on('fs.exists', (_, e) => ({ value: e.path === `${COMMON}/.graphite_repo_config` }))
  on('fs.read', (_, e) =>
    e.path === `${COMMON}/.graphite_pr_info` ? { value: JSON.stringify(repo.prInfo) } : { deny: 'no such file' },
  )
  on('fs.stat', () => ({
    value: { kind: 'file', size: 1, mtimeMs: NOW - (over.cacheAgeMs ?? 0), isLink: false },
  }))
  on('mcp.call', () => ({
    value: {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            bound: true,
            pr: { number: 298, url: github(298), repo: 'bravely/demarest_mays', title: 'Give each worktree its own ports', state: 'open', draft: false, head: 'ports' },
            otherBoundPrs: [{ number: 12, repo: 'bravely/gtprobe-scratch', state: 'open' }],
          }),
        },
      ],
    },
  }))
  on('session.surfaces', () => ({ value: repo.surfaces }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('classic.FileChanged', () => ({}))
  on('classic.SessionStart', () => ({}))
  on('session.cwd', () => ({ value: TOP }))
  const ran = (prefix: string) => runs.filter(argv => argv.join(' ').startsWith(prefix)).length

  return { repo, runs, toasts, ran }
}


test('once the desktop attaches, the band draws what git, gt, its cache, ccd_pr and gh say', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  fakeRepo(on)

  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.advance(250)
  const ui = await $.ui.mount(BAND)

  expect(lines(await ui.drawn())).toEqual([
    '● [Graphite]#12 Probe gt sync',
    '──────────',
    '◯ [Graphite]#300 Seed per-worktree fixtures ↻ restack',
    '‹/› ● [Graphite]#298 Give each worktree its own ports',
    '✓ [Graphite]#295 Split settings into sections gt sync',
    '‹/› ┴ main',
  ])
  await ui.unmount()
})

test('a burst of triggers inside 250 ms makes one refresh', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = fakeRepo(on)

  for (const path of ['HEAD', 'refs/heads', '.graphite_metadata.db']) {
    await $.classic.FileChanged({ file_path: `${COMMON}/${path}`, event: 'change' })
  }
  await clock.advance(249)
  expect(ran('gt state')).toBe(0)
  await clock.advance(1)
  expect(ran('gt state')).toBe(1)
})

test('triggers during a refresh queue one more refresh, and the latest result wins', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { repo, ran } = fakeRepo(on)
  let release = () => {}
  let reached = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  const isHeld = new Promise<void>(resolve => (reached = resolve))
  const answer = repo.gt
  repo.gt = async () => {
    repo.gt = answer
    reached()
    await held
    return answer()
  }
  const trigger = async () => {
    await $.classic.FileChanged({ file_path: `${GIT_DIR}/HEAD`, event: 'change' })
    return clock.advance(250)
  }

  const first = trigger()
  await isHeld
  repo.branch = 'fixtures'
  await trigger()
  await trigger()
  release()
  await first
  await clock.settle()

  expect(ran('gt state')).toBe(2)
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ key: 'row-fixtures' }))?.props.backgroundColor).toBe('promptBorder')
  await ui.unmount()
})

test('a local refresh asks gh only when the cache is stale, at most every 2 minutes', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = fakeRepo(on, { cacheAgeMs: 11 * MINUTE })
  const local = async () => {
    await $.classic.FileChanged({ file_path: `${GIT_DIR}/HEAD`, event: 'change' })
    await clock.advance(250)
  }

  await local()
  expect(ran('gh pr list')).toBe(1)
  await local()
  expect(ran('gh pr list')).toBe(1)
  await clock.advance(2 * MINUTE)
  await local()
  expect(ran('gh pr list')).toBe(2)
})

test('a fresh cache that knows every branch needs no gh, but a GitHub wake asks anyway', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = fakeRepo(on)

  await $.classic.FileChanged({ file_path: `${GIT_DIR}/HEAD`, event: 'change' })
  await clock.advance(250)
  expect(ran('gh pr list')).toBe(0)
  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: 'PR merged',
    event: { source: 'github', kind: 'pull_request.closed', data: {}, untrustedKeys: [] },
  })
  await clock.advance(250)
  expect(ran('gh pr list')).toBe(1)
})

test('a gh failure the band shows is raised as one turn per distinct error', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { repo } = fakeRepo(on)
  repo.prInfo = { prInfos: PR_INFO.prInfos.slice(0, 2) }
  repo.gh = () => ({ exitCode: 1, stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)\n' })
  const turns: string[] = []
  on('prompt.submit', (_, e) => {
    turns.push(e.text)
    return { text: e.text }
  })
  const wake = async () => {
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await clock.advance(250)
  }

  await wake()
  await wake()
  const ui = await $.ui.mount(BAND)
  expect(lines(await ui.drawn())[2]).toBe(
    '◌ PR ? fixtures ↻ restack · gh pr list failed: HTTP 401: Bad credentials (https://api.github.com/graphql)',
  )
  await ui.unmount()
  repo.gh = () => ({ exitCode: 1, stderr: 'error connecting to api.github.com\n' })
  await wake()
  expect(turns).toEqual([
    "The Openers band couldn't look up this Stack's PRs with gh: gh pr list failed: HTTP 401: Bad credentials (https://api.github.com/graphql). Find out why, and fix it if you can.",
    "The Openers band couldn't look up this Stack's PRs with gh: gh pr list failed: error connecting to api.github.com. Find out why, and fix it if you can.",
  ])
})

test('a Bash call that runs git refreshes locally, and one that merges a PR asks gh too', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = fakeRepo(on)
  const answers = [{}, {}, { gitOperation: { pr: { number: 298, action: 'merged' as const } } }]
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false, ...answers.shift() },
  }))
  const bash = async (command: string) => {
    await $.tool.call({ tool: 'Bash', command })
    await clock.advance(250)
  }

  await bash('ls -la')
  expect(ran('gt state')).toBe(0)
  await bash('cd .. && git switch fixtures')
  expect([ran('gt state'), ran('gh pr list')]).toEqual([1, 0])
  await bash('gh pr merge 298 --squash')
  expect([ran('gt state'), ran('gh pr list')]).toEqual([2, 1])
})

test('session start answers the file watch', async ($, on) => {
  mock.clock(on, { now: NOW })
  fakeRepo(on)

  const answered = await $.classic.SessionStart({ source: 'startup' })
  expect(answered.watchPaths).toEqual([
    `${GIT_DIR}/HEAD`,
    `${COMMON}/refs/heads`,
    `${COMMON}/.graphite_metadata.db`,
    `${COMMON}/.graphite_pr_info`,
  ])
})

test('outside the desktop nothing is run', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { repo, runs } = fakeRepo(on)
  repo.surfaces = ['terminal']

  await $.classic.FileChanged({ file_path: `${GIT_DIR}/HEAD`, event: 'change' })
  await clock.advance(250)
  expect(runs).toEqual([])
})

test('without gt on PATH the band says gt is not installed', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { repo } = fakeRepo(on)
  repo.gt = () => 'not on PATH'

  await $.classic.FileChanged({ file_path: `${GIT_DIR}/HEAD`, event: 'change' })
  await clock.advance(250)
  const ui = await $.ui.mount(BAND)
  expect(lines(await ui.drawn()).slice(-2)).toEqual([
    '‹/› ● [Graphite]#298 Give each worktree its own ports',
    '‹/› ┴ main · gt not installed',
  ])
  await ui.unmount()
})
