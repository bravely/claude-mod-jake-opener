import { atom, read, update } from 'claude-code'
import type { EngineInterface, MatchedHook, RenderChildren, ThemeKey } from 'claude-code'

import type { PrRef, PrState } from '../types'
import { COMMANDS, readRunning, runCommand } from './commands'
import { OPENERS, openTarget, type Opener } from './openers'
import { readPaneOpen, togglePane } from './pane'
import { CIRCLES, GRAPHITE_SVG } from './pr'
import { readSnapshot } from './snapshot'
import { bandModel, nextPick } from './stack'
import type { LadderRow, PrLookup, RowLink, Trail, Via } from './stack'

const forkPicks = atom({ plugin: 'jake-opener', key: 'forkPicks' } as const, {})

// Links the mod answers itself: a Markdown link on a placeholder href, one row
// high where a native Button would stretch the row; `.invalid` never opens.
const href = (name: string, id = '') => `https://${name}.invalid/${encodeURIComponent(id)}`

// Presses read the Snapshot as it is now, not as it was drawn.
async function openEditor($: EngineInterface, opener: Opener, missing?: string) {
  const s = await readSnapshot($)
  const target = s && opener.resolve(s)
  if (target) openTarget($, opener, target)
  else if (missing) $.ui.toast(missing)
}

async function stepFork($: EngineInterface, via: Via) {
  const s = await readSnapshot($)
  const pick = s && nextPick(s, via)
  if (pick) await update($, forkPicks, picks => ({ ...picks, [via.at]: pick }))
}

const fixPrompt = (branch: string) =>
  `The restack of ${branch} stopped on a conflict. Resolve the conflict and continue the restack.`

export const renderBand: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
  const s = await readSnapshot($)
  if (!s) return next(e)
  const band = bandModel(s, await read($, forkPicks))
  const busy = await readRunning($)
  const isPaneOpen = await readPaneOpen($)
  const { Box, Link, Markdown, Svg, Text } = $.ui.resolve(e)

  // every link is disabled while a command runs, so clicks don't queue
  const control = (key: string, label: string, target: string, onPress: () => unknown) =>
    busy ? (
      <Text dimColor>{label}</Text>
    ) : (
      <Markdown key={key} text={`[${label}](${target})`} pressableLinks={[target]} onLinkPress={() => void onPress()} />
    )
  const worktreeEditor = control('editor-worktree', '‹/›', href('editor', 'worktree'), () =>
    openEditor($, OPENERS.worktreeEditor),
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
  const graphiteLink = (pr: PrRef, isCurrent: boolean) => {
    const target = OPENERS.graphite.resolve(s, pr)

    return (
      target?.kind === 'url' && (
        <Box flexDirection="row" alignItems="center" gap={0}>
          <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />
          <Link href={target.url}>
            <Text bold={isCurrent}>#{pr.number}</Text>
          </Link>
        </Box>
      )
    )
  }
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

  const rowLink = (link: RowLink, branch: string) =>
    link === 'fix'
      ? control(`fix-${branch}`, 'fix it', href('fix', branch), () => $.prompt.fill({ text: fixPrompt(branch) }))
      : control(`${link}-${branch}`, COMMANDS[link].label, href(link, branch), () => runCommand($, link, branch))
  const trail = (items: Trail[], key: string) => [
    ...items.map(t => {
      if (t.kind === 'link') return rowLink(t.link, key)
      if (t.isProblem) return <Text color="error">· {t.text}</Text>

      return (
        <Text dimColor italic>
          · {t.text}
        </Text>
      )
    }),
    busy?.row === key && <Text dimColor>running…</Text>,
  ]

  const ladderRow = (r: LadderRow) => {
    const isGone = r.state === 'merged' || r.state === 'closed'
    const hasProblem = r.trail.some(t => t.kind === 'note' && t.isProblem)
    const via = r.via
    const left = via
      ? control(`fork-${via.at}`, `⑂ ${via.i + 1}/${via.n}`, href('fork', via.at), () => stepFork($, via))
      : r.isCurrent && worktreeEditor

    return row(`row-${r.branch}`, r.isCurrent ? (hasProblem ? 'diffRemovedDimmed' : 'promptBorder') : undefined, [
      gutter(left),
      circle(r.state),
      prCell(r.lookup, r.isCurrent),
      <Text bold={r.isCurrent} dimColor={!r.isCurrent || isGone} strikethrough={isGone}>
        {r.title}
      </Text>,
      ...trail(r.trail, r.branch),
    ])
  }

  if (band.kind === 'folder') {
    return row('folder', undefined, [gutter(worktreeEditor), <Text dimColor>{band.path}</Text>])
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
        {row('detached', 'promptBorder', [gutter(worktreeEditor), circle('none'), <Text bold>detached at {band.sha}</Text>])}
      </Box>
    )
  }

  const t = band.trunk
  const trunkEditor = control('editor-trunk', '‹/›', href('editor', 'trunk'), () =>
    openEditor($, OPENERS.trunkEditor, `No worktree has ${t.name} checked out`),
  )

  return (
    <Box flexDirection="column" rowGap="xs">
      {rail}
      {rule}
      {band.rows.map(ladderRow)}
      {row('trunk', t.isCurrent ? 'promptBorder' : undefined, [
        gutter(t.isCurrent ? worktreeEditor : trunkEditor),
        // one Text, so the row's gap doesn't split "main(trunk)"
        <Text>
          <Text bold={t.isCurrent} dimColor={!t.isCurrent}>
            ┴ {t.name}
          </Text>
          {t.isCurrent && <Text dimColor>(trunk)</Text>}
        </Text>,
        ...trail(t.trail, 'trunk'),
        t.stackCount !== undefined &&
          control('stack', `${isPaneOpen ? '◧' : '◨'} Stack (${t.stackCount})`, href('stack'), () => togglePane($)),
      ])}
    </Box>
  )
}
