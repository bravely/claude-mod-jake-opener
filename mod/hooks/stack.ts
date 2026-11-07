import type { GtBranch, KnownPr, PrRef, PrState, RepoSnapshot, Snapshot } from '../types'
import { githubUrl } from './pr'

export type PrLookup =
  | { kind: 'found'; pr: KnownPr }
  | { kind: 'none' }
  // gh hasn't answered yet
  | { kind: 'pending' }
  | { kind: 'failed'; error: string }

// what follows a row's title, in order
export type Trail = { kind: 'note'; text: string; isProblem: boolean }

// a row reached through a fork: child i of n at branch `at`
export type Via = { at: string; i: number; n: number }

export type LadderRow = {
  branch: string
  via?: Via
  isCurrent: boolean
  state: PrState
  lookup: PrLookup
  title: string
  trail: Trail[]
}

type TrunkRow = { name: string; isCurrent: boolean; trail: Trail[] }

type RailRow = { pr: PrRef; state: PrState; title: string }

export type Band =
  | { kind: 'folder'; path: string }
  | { kind: 'detached'; rail: RailRow[]; sha: string }
  // `stack`: every branch of the Stack, whether the ladder shows it or not
  | { kind: 'ladder'; rail: RailRow[]; rows: LadderRow[]; trunk: TrunkRow; stack: LadderRow[] }

// Per PR, the first source that knows it: gh from this session, then ccd_pr,
// then gt's cache.
const SOURCES: ((s: RepoSnapshot, branch: string) => KnownPr | undefined)[] = [
  (s, branch) => s.ghPrs?.byBranch[branch],
  (s, branch) => (s.rail?.pr?.head === branch ? s.rail.pr : undefined),
  (s, branch) => s.prCache?.byBranch[branch],
]

function lookupPr(s: RepoSnapshot, branch: string): PrLookup {
  const known = SOURCES.flatMap(source => source(s, branch) ?? [])
  const first = known[0]
  if (first) return { kind: 'found', pr: { ...first, title: known.find(k => k.title)?.title } }
  if (s.ghPrs === undefined) return { kind: 'pending' }
  if (s.ghPrs.error !== undefined) return { kind: 'failed', error: s.ghPrs.error }

  return { kind: 'none' }
}

const stateOf = (lookup: PrLookup): PrState => (lookup.kind === 'found' ? lookup.pr.state : 'none')

function childrenOf(gtState: Record<string, GtBranch>): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const [branch, { parent }] of Object.entries(gtState)) {
    if (parent !== undefined) children.set(parent, [...(children.get(parent) ?? []), branch])
  }

  return children
}

// the branches under `branch` down to trunk, nearest first
function below(gtState: Record<string, GtBranch>, branch: string): string[] {
  const out: string[] = []
  let at = gtState[branch]?.parent
  while (at !== undefined && !out.includes(at)) {
    const node = gtState[at]
    if (!node || node.isTrunk) break
    out.push(at)
    at = node.parent
  }

  return out
}

// the picked path above `branch`, nearest first; a pick defaults to the
// first child
function above(children: Map<string, string[]>, branch: string, picks: Record<string, string>) {
  const out: { branch: string; via?: Via }[] = []
  let at = branch
  for (;;) {
    const kids = children.get(at) ?? []
    const i = Math.max(0, kids.indexOf(picks[at] ?? ''))
    const next = kids[i]
    if (next === undefined || next === branch || out.some(r => r.branch === next)) return out
    out.push({ branch: next, via: kids.length > 1 ? { at, i, n: kids.length } : undefined })
    at = next
  }
}

// the Stack's branches in tree order from its bottom branch, with depth
function tree(s: RepoSnapshot, current: string) {
  const children = childrenOf(s.gtState)
  const root = below(s.gtState, current).at(-1) ?? current
  const out: { branch: string; depth: number }[] = []
  const walk = (branch: string, depth: number) => {
    if (out.some(r => r.branch === branch)) return
    out.push({ branch, depth })
    for (const kid of children.get(branch) ?? []) walk(kid, depth + 1)
  }
  walk(root, 0)

  return out
}

// the next child at a fork, as `forkPicks` records it
export function nextPick(s: Snapshot, via: Via): string | undefined {
  if (s.topLevel === null) return undefined

  return childrenOf(s.gtState).get(via.at)?.[(via.i + 1) % via.n]
}

const note = (text: string, isProblem = false): Trail => ({ kind: 'note', text, isProblem })

function ladderRow(s: RepoSnapshot, branch: string, current: string, via?: Via): LadderRow {
  const lookup = lookupPr(s, branch)
  const state = stateOf(lookup)
  const trail: Trail[] = []
  if (lookup.kind === 'failed') trail.push(note(lookup.error, true))
  if (branch === current && s.rebase !== undefined) trail.push(note('rebase stopped on a conflict', true))

  return {
    branch,
    via,
    isCurrent: branch === current,
    state,
    lookup,
    title: (lookup.kind === 'found' && lookup.pr.title) || branch,
    trail,
  }
}

function railRows(s: RepoSnapshot, stack: Set<string>): RailRow[] {
  const gh = new Map(Object.values(s.ghPrs?.byBranch ?? {}).map(k => [githubUrl(k.ref), k]))
  const seen = new Set(stack)
  const bound = [s.rail?.pr, ...(s.rail?.others ?? [])].flatMap(k => k ?? [])

  return bound.flatMap(known => {
    const url = githubUrl(known.ref)
    if (seen.has(url)) return []
    seen.add(url)
    const { owner, repo, number } = known.ref

    return [
      {
        pr: known.ref,
        state: (gh.get(url) ?? known).state,
        title: known.title ?? s.ghPrs?.titles[url] ?? `${owner}/${repo}#${number}`,
      },
    ]
  })
}

const prUrls = (rows: LadderRow[]) =>
  new Set(rows.flatMap(r => (r.lookup.kind === 'found' ? [githubUrl(r.lookup.pr.ref)] : [])))

// mid-rebase HEAD is detached; the rebase names the branch
const currentBranch = (s: RepoSnapshot) => (s.branch === 'HEAD' ? s.rebase : s.branch)

type Ladder = { rows: LadderRow[]; trunk: Omit<TrunkRow, 'name'>; stack: LadderRow[] }

// Each situation the band can be in, decided once, in the spec's order of
// precedence.
function ladderOf(s: RepoSnapshot, current: string, picks: Record<string, string>): Ladder {
  if (!s.gtInstalled || !s.gtInitialised) {
    const rows = [ladderRow(s, current, current)]
    const trail = s.gtInstalled
      ? [note('gt not initialised here', true)]
      : [note('gt not installed', true)]

    return { rows, trunk: { isCurrent: false, trail }, stack: rows }
  }
  if (s.gtState[current]?.isTrunk) {
    return { rows: [], trunk: { isCurrent: true, trail: [note('gt create to start a Stack')] }, stack: [] }
  }
  if (!s.gtState[current]) {
    const row = ladderRow(s, current, current)
    row.trail.push(note('not tracked'))

    return { rows: [row], trunk: { isCurrent: false, trail: [] }, stack: [row] }
  }

  const rows = [
    ...above(childrenOf(s.gtState), current, picks)
      .reverse()
      .map(r => ladderRow(s, r.branch, current, r.via)),
    ladderRow(s, current, current),
    ...below(s.gtState, current).map(b => ladderRow(s, b, current)),
  ]
  const stack = tree(s, current).map(r => ladderRow(s, r.branch, current))

  return { rows, trunk: { isCurrent: false, trail: [] }, stack }
}

export function bandModel(s: Snapshot, picks: Record<string, string>): Band {
  if (s.topLevel === null) return { kind: 'folder', path: s.cwd }
  const current = currentBranch(s)
  if (current === undefined) return { kind: 'detached', rail: railRows(s, new Set()), sha: s.head }
  const { rows, trunk, stack } = ladderOf(s, current, picks)

  return { kind: 'ladder', rail: railRows(s, prUrls(stack)), rows, trunk: { name: s.trunk ?? 'trunk', ...trunk }, stack }
}
