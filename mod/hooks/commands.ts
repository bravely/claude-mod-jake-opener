import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook } from 'claude-code'

import type { BandRun, CommandLink, Running } from '../types'
import { requestRefresh, type Tier } from './refresh'
import { readSnapshot } from './snapshot'

const running = atom({ plugin: 'jake-opener', key: 'running' } as const, null)
const bandRuns = atom({ plugin: 'jake-opener', key: 'bandRuns' } as const, [])

export function readRunning($: EngineInterface): Promise<Running | null> {
  return read($, running)
}

const flag = (name: string, value?: string) => (value ? [name, value] : [])

type Command = { label: string; argv(trunk?: string): string[]; refresh: Tier }

export const COMMANDS: Record<CommandLink, Command> = {
  track: {
    label: 'gt track',
    argv: trunk => ['gt', 'track', ...flag('--parent', trunk), '--no-interactive'],
    refresh: 'local',
  },
  restack: { label: '↻ restack', argv: () => ['gt', 'restack', '--no-interactive'], refresh: 'local' },
  // no -d: it deletes every merged or closed branch in the repo, not just this
  // Stack's, and moves HEAD to trunk when the current branch is the merged one
  sync: { label: 'gt sync', argv: () => ['gt', 'sync', '--no-interactive'], refresh: 'network' },
  init: {
    label: 'gt init',
    argv: trunk => ['gt', 'init', ...flag('--trunk', trunk), '--no-interactive'],
    refresh: 'local',
  },
}

// gt reports a restack conflict on stdout and its own errors on stderr
function summarize(stdout: string, stderr: string): string {
  const out = `${stdout}\n${stderr}`.split('\n').map(l => l.trim())

  return out.find(l => l.startsWith('ERROR:') || l.startsWith('Hit conflict')) ?? out.filter(Boolean).at(-1) ?? ''
}

function failureToast(link: CommandLink, summary: string): string {
  return summary.startsWith('Hit conflict')
    ? 'restack stopped on a conflict'
    : `${COMMANDS[link].label} failed: ${summary}`
}

export async function runCommand($: EngineInterface, link: CommandLink, row: string) {
  const s = await readSnapshot($)
  if (!s?.topLevel) return
  const mine: Running = { link, row }
  // clicks don't queue: a press while another command runs does nothing
  if ((await update($, running, now => now ?? mine)) !== mine) return

  const argv = COMMANDS[link].argv(s.trunk)
  const ran = await $.process
    .run(argv, { cwd: s.topLevel })
    .catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  const summary = summarize(ran.stdout, ran.stderr)
  const run: BandRun = { argv, dir: s.topLevel, exitCode: ran.exitCode, summary }
  await update($, bandRuns, runs => [...runs, run])
  await update($, running, () => null)
  if (ran.exitCode !== 0) $.ui.toast(failureToast(link, summary))
  requestRefresh($, COMMANDS[link].refresh)
}

// A reload drops the environment a run was awaited in, so nothing would clear
// its `running` and the band's links would stay disabled.
export async function clearRunning($: EngineInterface): Promise<void> {
  await update($, running, () => null)
}

// The model can't see repo changes `$.process.run` made, so what the band ran
// rides on the next prompt.
export const attachBandRuns: Hook<'prompt.submit'> = async ($, e, next) => {
  const runs = await read($, bandRuns)
  if (runs.length === 0) return next(e)
  await update($, bandRuns, () => [])
  const context = runs.map(
    r => `The Openers band ran \`${r.argv.join(' ')}\` in ${r.dir}: exit ${r.exitCode}. ${r.summary}`,
  )

  return next({ ...e, context: [...(e.context ?? []), ...context] })
}
