import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, ProcessRunResult } from 'claude-code'

import type { GhPrs, GtBranch, KnownPr, PrCache, PrRef, Rail, RepoSnapshot, Snapshot } from '../types'
import { githubUrl, parsePrUrl, prFromRepo } from './pr'

// Change the tag when Snapshot's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshotState = atom({ plugin: 'jake-opener', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})

export function readSnapshot($: EngineInterface): Promise<Snapshot | null> {
  return read($, snapshotState)
}

export async function writeSnapshot($: EngineInterface, s: Snapshot): Promise<void> {
  await update($, snapshotState, () => s)
}

// the wire shapes, as far as they are read
type GtStateWire = Record<string, { trunk?: boolean; needs_restack?: boolean; parents?: { ref?: string }[] }>
type PrWire = { number?: number; url?: string; state?: string; isDraft?: boolean; headRefName?: string; title?: string }
type PrInfoWire = { prInfos?: (Omit<PrWire, 'number'> & { prNumber?: number })[] }
type RailWire = {
  pr?: { number?: number; url?: string; title?: string; state?: string; draft?: boolean; head?: string } | null
  otherBoundPrs?: { number?: number; repo?: string; state?: string }[]
}

const STATES: Record<string, KnownPr['state']> = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' }

const prState = (state?: string, isDraft?: boolean): KnownPr['state'] | undefined => {
  const s = STATES[state?.toUpperCase() ?? '']

  return s === 'open' && isDraft ? 'draft' : s
}

function parseJson<T>(text: string | undefined): T | undefined {
  try {
    return text === undefined ? undefined : (JSON.parse(text) as T)
  } catch {
    return undefined
  }
}

// a command that can't start (not on PATH) answers undefined
function run($: EngineInterface, argv: string[], cwd: string): Promise<ProcessRunResult | undefined> {
  return $.process.run(argv, { cwd }).catch(() => undefined)
}

const stdoutOf = (r: ProcessRunResult | undefined) => (r?.exitCode === 0 ? r.stdout.trim() : undefined)

function readText($: EngineInterface, path: string): Promise<string | undefined> {
  return $.fs.read(path).then(
    text => (typeof text === 'string' ? text : undefined),
    () => undefined,
  )
}

function parseGtState(stdout: string | undefined): Record<string, GtBranch> | undefined {
  const wire = parseJson<GtStateWire>(stdout)
  if (!wire || typeof wire !== 'object') return undefined

  return Object.fromEntries(
    Object.entries(wire).map(([branch, b]) => [
      branch,
      { parent: b?.parents?.[0]?.ref, isTrunk: b?.trunk === true, needsRestack: b?.needs_restack === true },
    ]),
  )
}

const urlRef = (pr: PrWire) => (pr.url ? parsePrUrl(pr.url) : undefined)

function knownPr(ref: PrRef | undefined, pr: PrWire): KnownPr | undefined {
  const state = prState(pr.state, pr.isDraft)

  return ref && state ? { ref, state, title: pr.title || undefined } : undefined
}

function byBranch(prs: PrWire[]): Record<string, KnownPr> {
  return Object.fromEntries(
    prs.flatMap(pr => {
      const known = knownPr(urlRef(pr), pr)
      return known && pr.headRefName ? [[pr.headRefName, known]] : []
    }),
  )
}

function parseRail(result: McpToolResult | undefined): Rail | undefined {
  const block = result?.isError ? undefined : result?.content.find(b => b.type === 'text')
  const wire = parseJson<RailWire>(block && 'text' in block ? block.text : undefined)
  if (!wire) return undefined
  const pr = wire.pr ? knownPr(urlRef(wire.pr), { ...wire.pr, isDraft: wire.pr.draft }) : undefined
  const others = (wire.otherBoundPrs ?? []).flatMap(
    o => knownPr(o.repo && o.number ? prFromRepo(o.repo, o.number) : undefined, o) ?? [],
  )

  return { pr: pr && { ...pr, head: wire.pr?.head }, others }
}

// the worktree whose checkout is `branch`
function worktreeOf(porcelain: string | undefined, branch: string | undefined): string | undefined {
  const entry = porcelain
    ?.split('\n\n')
    .map(block => block.split('\n'))
    .find(lines => lines.includes(`branch refs/heads/${branch}`))

  return entry?.[0]?.replace(/^worktree /, '')
}

const GIT_DIRS = ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir', '--git-dir']

export async function gatherLocal($: EngineInterface, cwd: string, prev: Snapshot | null): Promise<Snapshot> {
  const dirs = stdoutOf(await run($, [...GIT_DIRS, '--show-toplevel'], cwd))?.split('\n')
  const [commonDir, gitDir, topLevel] = dirs ?? []
  if (!commonDir || !gitDir || !topLevel) return { cwd, topLevel: null }

  const git = (...args: string[]) => run($, ['git', ...args], topLevel).then(stdoutOf)
  const [branch, head, originHead, worktrees, gt, hasConfig, prInfo, prInfoStat, rebase, rail] = await Promise.all([
    git('rev-parse', '--abbrev-ref', 'HEAD'),
    git('rev-parse', '--short', 'HEAD'),
    git('rev-parse', '--abbrev-ref', 'origin/HEAD'),
    git('worktree', 'list', '--porcelain'),
    run($, ['gt', 'state', '--no-interactive'], topLevel),
    $.fs.exists(`${commonDir}/.graphite_repo_config`).catch(() => false),
    readText($, `${commonDir}/.graphite_pr_info`),
    $.fs.stat(`${commonDir}/.graphite_pr_info`).catch(() => undefined),
    readText($, `${gitDir}/rebase-merge/head-name`).then(
      name => name ?? readText($, `${gitDir}/rebase-apply/head-name`),
    ),
    $.mcp.call('ccd_pr', 'get_status', {}).catch(() => undefined),
  ])

  const gtState = gt?.exitCode === 0 ? parseGtState(gt.stdout) : undefined
  const gtInitialised = hasConfig && gtState !== undefined
  const trunk = gtInitialised
    ? Object.keys(gtState).find(b => gtState[b]?.isTrunk)
    : originHead?.replace(/^origin\//, '')
  const prInfos = parseJson<PrInfoWire>(prInfo)?.prInfos
  const prCache: PrCache | undefined =
    prInfos && prInfoStat
      ? { byBranch: byBranch(prInfos.map(p => ({ ...p, number: p.prNumber }))), mtimeMs: prInfoStat.mtimeMs }
      : undefined

  return {
    cwd,
    topLevel,
    branch: branch ?? 'HEAD',
    commonDir,
    gitDir,
    head: head ?? '',
    rebase: rebase?.trim().replace(/^refs\/heads\//, ''),
    gtState: gtState ?? {},
    gtInitialised,
    gtInstalled: gt !== undefined,
    trunk,
    trunkWorktree: worktreeOf(worktrees, trunk),
    prCache,
    rail: parseRail(rail),
    // gh's answer stands until the network tier asks again
    ghPrs: prev?.topLevel === topLevel ? prev.ghPrs : undefined,
  }
}

const GH_LIST = ['gh', 'pr', 'list', '--state', 'all', '--json', 'number,url,state,isDraft,headRefName,title', '--limit', '200']

export async function gatherNetwork($: EngineInterface, s: RepoSnapshot): Promise<GhPrs> {
  const list = await run($, GH_LIST, s.topLevel)
  const prs = list?.exitCode === 0 ? parseJson<PrWire[]>(list.stdout) : undefined
  const error = prs
    ? undefined
    : `gh pr list failed: ${list?.stderr.trim().split('\n')[0] || (list ? `exit ${list.exitCode}` : 'gh not found')}`

  // a title per rail PR, asked once per URL
  const titles = { ...s.ghPrs?.titles }
  const untitled = (s.rail?.others ?? []).map(o => githubUrl(o.ref)).filter(url => !(url in titles))
  const answers = await Promise.all(untitled.map(url => run($, ['gh', 'pr', 'view', url, '--json', 'title'], s.topLevel)))
  untitled.forEach((url, i) => {
    const title = parseJson<{ title?: string }>(stdoutOf(answers[i]))?.title
    if (title) titles[url] = title
  })

  return { byBranch: prs ? byBranch(prs) : (s.ghPrs?.byBranch ?? {}), titles, error }
}

export async function watchPaths($: EngineInterface, cwd: string): Promise<string[]> {
  const [commonDir, gitDir] = stdoutOf(await run($, GIT_DIRS, cwd))?.split('\n') ?? []
  if (!commonDir || !gitDir) return []

  return [
    `${gitDir}/HEAD`,
    `${commonDir}/refs/heads`,
    `${commonDir}/.graphite_metadata.db`,
    `${commonDir}/.graphite_pr_info`,
  ]
}
