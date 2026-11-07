import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook, Timer } from 'claude-code'

import type { RepoSnapshot, Snapshot } from '../types'
import { gatherLocal, gatherNetwork, readSnapshot, watchPaths, writeSnapshot } from './snapshot'
import { bandModel, type PrLookup } from './stack'

// `network` is local and then network
export type Tier = 'local' | 'network'

const DEBOUNCE_MS = 250
const BACKSTOP_MS = 60_000
const STALE_CACHE_MS = 10 * 60_000
const NETWORK_EVERY_MS = 2 * 60_000

const reportedErrors = atom({ plugin: 'jake-opener', key: 'reportedErrors' } as const, null)

const widest = (a: Tier | undefined, b: Tier): Tier => (a === 'network' ? a : b)

// One refresh runs at a time with at most one queued, so results land in the
// order refreshes started and the latest always wins. A `$.process.run` can't
// be cancelled, so nothing is aborted: a queued refresh just runs after.
type Phase = { kind: 'idle' } | { kind: 'running'; queued?: Tier }

let phase: Phase = { kind: 'idle' }
let debounce: { tier: Tier; timer: Timer } | undefined
let lastNetworkAt = -Infinity

export function requestRefresh($: EngineInterface, tier: Tier): void {
  debounce?.timer.cancel()
  const merged = widest(debounce?.tier, tier)
  debounce = {
    tier: merged,
    timer: $.clock.after(DEBOUNCE_MS, () => {
      debounce = undefined
      void start($, merged)
    }),
  }
}

async function start($: EngineInterface, tier: Tier): Promise<void> {
  if (phase.kind === 'running') {
    phase = { kind: 'running', queued: widest(phase.queued, tier) }
    return
  }
  phase = { kind: 'running' }
  try {
    await refresh($, tier)
  } finally {
    const queued = phase.kind === 'running' ? phase.queued : undefined
    phase = { kind: 'idle' }
    if (queued) void start($, queued)
  }
}

// the PR lookups of every branch of the Stack, shown or not
function stackLookups(s: Snapshot): PrLookup[] {
  const band = bandModel(s, {})

  return band.kind === 'ladder' ? band.stack.map(r => r.lookup) : []
}

// gt's PR cache can be an hour stale, and a branch it doesn't know waits on gh
function wantsNetwork(s: RepoSnapshot, now: number): boolean {
  const isStale = !s.prCache || now - s.prCache.mtimeMs > STALE_CACHE_MS

  return isStale || stackLookups(s).some(l => l.kind === 'pending' || l.kind === 'failed')
}

async function refresh($: EngineInterface, tier: Tier): Promise<void> {
  // every surface but the desktop is out of scope
  if (!(await $.session.surfaces()).includes('desktop')) return
  const local = await gatherLocal($, await $.session.cwd(), await readSnapshot($))
  await write($, local)
  if (local.topLevel === null) return

  const now = await $.clock.now()
  const isDue = now - lastNetworkAt >= NETWORK_EVERY_MS && wantsNetwork(local, now)
  if (tier === 'local' && !isDue) return
  lastNetworkAt = now
  await write($, { ...local, ghPrs: await gatherNetwork($, local) })
}

async function write($: EngineInterface, s: Snapshot): Promise<void> {
  await writeSnapshot($, s)
  await reportGhFailure($, s)
}

// One turn per distinct gh failure the band shows; a changed or cleared
// error resets it.
async function reportGhFailure($: EngineInterface, s: Snapshot): Promise<void> {
  const failed = stackLookups(s).find(l => l.kind === 'failed')
  const error = failed?.kind === 'failed' ? failed.error : null
  if (error === (await read($, reportedErrors))) return
  await update($, reportedErrors, () => error)
  if (error) {
    void $.prompt.submit({
      text: `The Openers band couldn't look up this Stack's PRs with gh: ${error}. Find out why, and fix it if you can.`,
    })
  }
}

// command text that runs git, gt or gh
const GIT_COMMAND = /(^|[\s;&|(`])(git|gt|gh)(\s|$)/m
const PR_CHANGES = ['created', 'merged', 'closed']

export const refreshAfterBash: MatchedHook<'tool.call', { tool: 'Bash' }> = async ($, e, next) => {
  const ran = await next(e)
  const action = ran.isError || ran.deny !== undefined ? undefined : ran.result?.gitOperation?.pr?.action
  if (action && PR_CHANGES.includes(action)) requestRefresh($, 'network')
  else if (GIT_COMMAND.test(e.command)) requestRefresh($, 'local')

  return ran
}

// at the session's start and after every reload, which drops the timers
export function startRefreshing($: EngineInterface): void {
  $.clock.every(BACKSTOP_MS, () => requestRefresh($, 'local'))
  requestRefresh($, 'local')
  // a hot reload on the desktop didn't redraw the band until the next input
  $.ui.invalidate('ui.render')
}

export const refreshOnSessionStart: Hook<'classic.SessionStart'> = async ($, e, next) => {
  const answered = await next(e)
  requestRefresh($, 'network')

  return { ...answered, watchPaths: [...(answered.watchPaths ?? []), ...(await watchPaths($, e.cwd))] }
}

export const refreshOnAttach: Hook<'session.attach'> = ($, e, next) => {
  if (e.surface === 'desktop') requestRefresh($, 'network')

  return next(e)
}

export const refreshOnFileChange: Hook<'classic.FileChanged'> = ($, e, next) => {
  requestRefresh($, 'local')

  return next(e)
}

export const refreshOnTurnComplete: Hook<'turn.complete'> = ($, e, next) => {
  requestRefresh($, 'local')

  return next(e)
}

export const refreshOnGithubWake: Hook<'session.receive'> = ($, e, next) => {
  if (e.event?.source === 'github') requestRefresh($, 'network')

  return next(e)
}
