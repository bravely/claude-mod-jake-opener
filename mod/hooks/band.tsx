import { atom, read, update } from 'claude-code'
import type { EngineInterface, MatchedHook, RenderChildren, ThemeKey } from 'claude-code'

import type { PrRef, PrState } from '../types'
import { CIRCLES, GRAPHITE_SVG, graphiteUrl } from './pr'
import { readSnapshot } from './snapshot'
import { bandModel, nextPick } from './stack'
import type { LadderRow, PrLookup, Trail, Via } from './stack'

const forkPicks = atom({ plugin: 'jake-opener', key: 'forkPicks' } as const, {})

// Links the mod answers itself: a Markdown link on a placeholder href, one row
// high where a native Button would stretch the row; `.invalid` never opens.
const href = (name: string, id = '') => `https://${name}.invalid/${encodeURIComponent(id)}`

// A press reads the Snapshot as it is now, not as it was drawn.
async function stepFork($: EngineInterface, via: Via) {
  const s = await readSnapshot($)
  const pick = s && nextPick(s, via)
  if (pick) await update($, forkPicks, picks => ({ ...picks, [via.at]: pick }))
}

export const renderBand: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
  const s = await readSnapshot($)
  if (!s) return next(e)
  const band = bandModel(s, await read($, forkPicks))
  const { Box, Link, Markdown, Svg, Text } = $.ui.resolve(e)

  const control = (key: string, label: string, target: string, onPress: () => unknown) => (
    <Markdown key={key} text={`[${label}](${target})`} pressableLinks={[target]} onLinkPress={() => void onPress()} />
  )

  const gutter = (child?: RenderChildren) => (
    <Box width={4} flexShrink={0}>
      {child}
    </Box>
  )
  const row = (key: string, background: ThemeKey | undefined, kids: RenderChildren) => (
    <Box key={key} flexDirection="row" gap="xs" alignItems="center" paddingX={1} backgroundColor={background}>
      {kids}
    </Box>
  )
  const circle = (state: PrState) => (
    <Text color={CIRCLES[state].color} dimColor={CIRCLES[state].dim}>
      {CIRCLES[state].glyph}
    </Text>
  )
  // an Svg can't sit inside a Link, so the icon only abuts it, in a gapless Box
  const graphiteLink = (pr: PrRef, isCurrent: boolean) => (
    <Box flexDirection="row" alignItems="center" gap={0}>
      <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />
      <Link href={graphiteUrl(pr)}>
        <Text bold={isCurrent}>#{pr.number}</Text>
      </Link>
    </Box>
  )
  const prCell = (lookup: PrLookup, isCurrent: boolean) => {
    switch (lookup.kind) {
      case 'found':
        return graphiteLink(lookup.pr.ref, isCurrent)
      case 'none':
        return <Text dimColor>no PR</Text>
      case 'pending':
        return <Text dimColor>PR …</Text>
      case 'failed':
        return <Text color="error">PR ?</Text>
    }
  }

  const trail = (items: Trail[]) =>
    items.map(t =>
      t.isProblem ? (
        <Text color="error">· {t.text}</Text>
      ) : (
        <Text dimColor italic>
          · {t.text}
        </Text>
      ),
    )

  const ladderRow = (r: LadderRow) => {
    const isGone = r.state === 'merged' || r.state === 'closed'
    const hasProblem = r.trail.some(t => t.isProblem)
    const via = r.via
    const left = via && control(`fork-${via.at}`, `⑂ ${via.i + 1}/${via.n}`, href('fork', via.at), () => stepFork($, via))

    return row(`row-${r.branch}`, r.isCurrent ? (hasProblem ? 'diffRemovedDimmed' : 'promptBorder') : undefined, [
      gutter(left),
      circle(r.state),
      prCell(r.lookup, r.isCurrent),
      <Text bold={r.isCurrent} dimColor={!r.isCurrent || isGone} strikethrough={isGone}>
        {r.title}
      </Text>,
      ...trail(r.trail),
    ])
  }

  if (band.kind === 'folder') {
    return row('folder', undefined, [gutter(), <Text dimColor>{band.path}</Text>])
  }

  const rail = band.rail.map(r =>
    row(`rail-${r.pr.owner}/${r.pr.repo}#${r.pr.number}`, undefined, [
      gutter(),
      circle(r.state),
      graphiteLink(r.pr, false),
      <Text dimColor>{r.title}</Text>,
    ]),
  )
  const rule = rail.length > 0 && <Text dimColor>{'─'.repeat(Math.max(1, e.props.bodyColumns - 2))}</Text>

  if (band.kind === 'detached') {
    return (
      <Box flexDirection="column" rowGap="xs">
        {rail}
        {rule}
        {row('detached', 'promptBorder', [gutter(), circle('none'), <Text bold>detached at {band.sha}</Text>])}
      </Box>
    )
  }

  const t = band.trunk

  return (
    <Box flexDirection="column" rowGap="xs">
      {rail}
      {rule}
      {band.rows.map(ladderRow)}
      {row('trunk', t.isCurrent ? 'promptBorder' : undefined, [
        gutter(),
        // one Text, so the row's gap doesn't split "main(trunk)"
        <Text>
          <Text bold={t.isCurrent} dimColor={!t.isCurrent}>
            ┴ {t.name}
          </Text>
          {t.isCurrent && <Text dimColor>(trunk)</Text>}
        </Text>,
        ...trail(t.trail),
      ])}
    </Box>
  )
}
