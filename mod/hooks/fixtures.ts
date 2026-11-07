// Test-only: Snapshots of one Stack in bravely/demarest_mays, and the band
// and pane as mounted on the desktop.
import type { On } from 'claude-code'

import type { GtBranch, KnownPr, RepoSnapshot, Snapshot } from '../types'

export const NOW = Date.UTC(2026, 10, 7, 12)

export const pr = (number: number, state: KnownPr['state'], title?: string, repo = 'demarest_mays'): KnownPr => ({
  ref: { owner: 'bravely', repo, number },
  state,
  title,
})

const tracked = (parent: string, needsRestack = false): GtBranch => ({ parent, isTrunk: false, needsRestack })

// main ← split ← databases ← ports (current) ← fixtures ← cookie
export const STACK: Record<string, GtBranch> = {
  main: { isTrunk: true, needsRestack: false },
  split: tracked('main'),
  databases: tracked('split'),
  ports: tracked('databases'),
  fixtures: tracked('ports'),
  cookie: tracked('fixtures', true),
}

export const CACHE: Record<string, KnownPr> = {
  split: pr(295, 'open', 'Split settings into sections'),
  databases: pr(297, 'open', 'Add worktree dev databases'),
  ports: pr(298, 'open', 'Give each worktree its own ports'),
  fixtures: pr(300, 'draft', 'Seed per-worktree fixtures'),
  cookie: pr(301, 'open', 'Session cookie per worktree'),
}

export const repo = (over: Partial<RepoSnapshot> = {}): RepoSnapshot => ({
  cwd: '/Users/bravely/dev/demarest_mays/.claude/worktrees/ports',
  topLevel: '/Users/bravely/dev/demarest_mays/.claude/worktrees/ports',
  branch: 'ports',
  commonDir: '/Users/bravely/dev/demarest_mays/.git',
  gitDir: '/Users/bravely/dev/demarest_mays/.git/worktrees/ports',
  head: '1e806cb',
  gtState: STACK,
  gtInitialised: true,
  gtInstalled: true,
  trunk: 'main',
  trunkWorktree: '/Users/bravely/dev/demarest_mays',
  prCache: { byBranch: CACHE, mtimeMs: NOW },
  rail: { others: [] },
  ghPrs: { byBranch: {}, titles: {} },
  ...over,
})

// what the band reads as the last Snapshot
export function seed(on: On, snapshot: Snapshot): void {
  on('state.get', { plugin: 'jake-opener', key: 'snapshot' }, () => ({
    value: { value: { shape: 'snapshot-1', value: snapshot }, version: 1 },
  }))
}

export const BAND = {
  plugin: 'jake-opener',
  surface: 'desktop',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 12,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

export const PANE = {
  plugin: 'jake-opener',
  surface: 'desktop',
  component: 'Pane',
  requestId: 'jake-opener-stack',
  props: {
    title: 'Stack',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

export type Ran = { exitCode: number; stdout?: string; stderr?: string } | 'not on PATH'

// The host: every command the mod runs, what each answers, and the toasts.
export function host(on: On, answer: (argv: readonly string[]) => Ran | Promise<Ran> = () => ({ exitCode: 0 })) {
  const runs: (readonly string[])[] = []
  const dirs: (string | undefined)[] = []
  const toasts: string[] = []
  on('process.run', async (_, e) => {
    runs.push(e.argv)
    dirs.push(e.init?.cwd)
    const ran = await answer(e.argv)
    if (ran === 'not on PATH') return { deny: `${e.argv[0]}: command not found` }
    const { exitCode, stdout = '', stderr = '' } = ran

    return { value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  return { runs, dirs, toasts }
}
