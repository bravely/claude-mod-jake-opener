import { atom, read, update } from 'claude-code'
import type { EngineInterface, MatchedHook } from 'claude-code'

import { OPENERS } from './openers'
import { CIRCLES, GRAPHITE_SVG } from './pr'
import { readSnapshot } from './snapshot'
import { paneRows } from './stack'

export const PANE = 'jake-opener-stack'

const paneOpen = atom({ plugin: 'jake-opener', key: 'paneOpen' } as const, false)

export function readPaneOpen($: EngineInterface): Promise<boolean> {
  return read($, paneOpen)
}

async function isPaneUp($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

// the engine's list of open panes decides: a pane outlives a reload, and the
// person may have closed it themselves
export async function togglePane($: EngineInterface): Promise<void> {
  if (await isPaneUp($)) {
    await $.ui.close({ id: PANE })
    // recorded here too: the ui.close hook alone left the toggle stale
    await update($, paneOpen, () => false)
  } else {
    await $.ui.open({ id: PANE, title: 'Stack' })
    await update($, paneOpen, () => true)
  }
}

export async function syncPaneOpen($: EngineInterface): Promise<void> {
  const isUp = await isPaneUp($)
  await update($, paneOpen, () => isUp)
}

export const notePaneClosed: MatchedHook<'ui.close', { id: typeof PANE }> = async ($, e, next) => {
  const closed = await next(e)
  await update($, paneOpen, () => false)

  return closed
}

export const renderPane: MatchedHook<'ui.render', { component: 'Pane'; requestId: typeof PANE }> = async (
  $,
  e,
  next,
) => {
  if (e.surface !== 'desktop') return next(e)
  const { Box, Link, Svg, Text } = $.ui.resolve(e)
  const s = await readSnapshot($)
  const stack = s && paneRows(s)
  if (!s || !stack) return <Text dimColor>Not in a Stack.</Text>

  return (
    <Box flexDirection="column">
      <Text dimColor>{stack.trunk}</Text>
      {stack.rows.map(r => {
        const pr = r.lookup.kind === 'found' ? r.lookup.pr.ref : undefined
        const github = OPENERS.github.resolve(s, pr)
        const graphite = OPENERS.graphite.resolve(s, pr)

        return (
          <Box
            key={`pane-${r.branch}`}
            flexDirection="row"
            gap="xs"
            paddingLeft={(r.depth + 1) * 2}
            backgroundColor={r.isCurrent ? 'promptBorder' : undefined}
          >
            <Text color={CIRCLES[r.state].color} dimColor={CIRCLES[r.state].dim}>
              {CIRCLES[r.state].glyph}
            </Text>
            <Text bold={r.isCurrent}>{r.title}</Text>
            {github?.kind === 'url' && <Link href={github.url}>GitHub</Link>}
            {graphite?.kind === 'url' && pr && (
              <Box flexDirection="row" alignItems="center" gap={0}>
                <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />
                <Link href={graphite.url}>#{pr.number}</Link>
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
