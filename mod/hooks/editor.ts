import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

const editorCommand = atom({ plugin: 'jake-opener', key: 'editorCommand' } as const, null)

// `--wait` would hold the run until the file is closed, past its timeout
const toArgv = (command: string) =>
  command
    .trim()
    .split(/\s+/)
    .filter(arg => arg && arg !== '--wait' && arg !== '-w')

// The desktop builds the engine's env without ~/.zshrc, where EDITOR is often
// set, so an interactive shell is asked once (~0.7 s) and its answer kept.
async function editorArgv($: EngineInterface): Promise<string[]> {
  const fromEnv = (await $.env.get('VISUAL')) || (await $.env.get('EDITOR'))
  if (fromEnv) return toArgv(fromEnv)
  const kept = await read($, editorCommand)
  if (kept) return kept

  const shell = (await $.env.get('SHELL')) || '/bin/zsh'
  const asked = await $.process
    .run([shell, '-ic', 'printf %s "${VISUAL:-$EDITOR}"'], { timeoutMs: 5_000 })
    .catch(() => undefined)
  const argv = asked?.exitCode === 0 ? toArgv(asked.stdout) : []
  if (argv.length > 0) await update($, editorCommand, () => argv)

  return argv
}

export async function launchEditor($: EngineInterface, label: string, dir: string): Promise<void> {
  const argv = await editorArgv($)
  if (argv.length === 0) return $.ui.toast(`Couldn't open ${label}: neither VISUAL nor EDITOR is set`)

  // not awaited, and never $.process.spawn, which kills the child when its loop ends
  void $.process.run([...argv, dir]).then(
    r => r.exitCode !== 0 && $.ui.toast(`Couldn't open ${label}: ${argv[0]} exited ${r.exitCode}`),
    err => $.ui.toast(`Couldn't open ${label}: ${String(err)}`),
  )
}
