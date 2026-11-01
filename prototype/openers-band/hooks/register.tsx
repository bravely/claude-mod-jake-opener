// PROTOTYPE, throw away. Answers "How should the Openers band look?"
// (bravely/claude-mod-jake-opener#6). Four variants of the band above the
// prompt, switched from the dim "prototype" row at its foot. The Stack is a
// fixture (real PR numbers from bravely/demarest_mays); the Openers are real:
// "Open in editor" runs $VISUAL/$EDITOR on the git top level, A's PR buttons
// run `open <url>`, B/C/pane PRs are <Link>s.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fixture, ForkRule, Variant } from '../types'

const variant = atom({ plugin: 'openers-band-prototype', key: 'variant' } as const, 'A' as Variant)
const fixture = atom({ plugin: 'openers-band-prototype', key: 'fixture' } as const, 'big' as Fixture)
const forkRule = atom({ plugin: 'openers-band-prototype', key: 'forkRule' } as const, 'path' as ForkRule)
const isStackOpen = atom(
  { plugin: 'openers-band-prototype', key: 'isStackOpen' } as const,
  false,
)
const forkPicks = atom(
  { plugin: 'openers-band-prototype', key: 'forkPicks' } as const,
  {} as Record<string, number>,
)

const VARIANTS: Variant[] = ['A', 'B', 'C', 'D']
const VARIANT_NAMES: Record<Variant, string> = {
  A: 'Chip row',
  B: 'Breadcrumb trail',
  C: 'Ladder',
  D: 'One button + pane',
}
const FIXTURES: Fixture[] = ['big', 'small', 'forked', 'none', 'nopr']
const FIXTURE_NAMES: Record<Fixture, string> = {
  big: 'Stack of 6',
  small: 'Stack of 2',
  forked: 'Forked Stack',
  none: 'Not in a Stack',
  nopr: 'Top branch has no PR',
}
const PANE = 'stack'

// ---- fixture Stacks -------------------------------------------------------

type PrState = 'open' | 'draft' | 'merged' | 'closed'
type Node = {
  branch: string
  parent: string
  pr?: number
  state?: PrState
  needsRestack?: boolean
  title: string
}
type StackFixture = { current: string; nodes: Node[] } | { current: string; nodes: null }

const big: Node[] = [
  { branch: 'a', parent: 'main', pr: 295, state: 'merged', title: 'Split settings into sections' },
  { branch: 'b', parent: 'a', pr: 297, state: 'open', title: 'Add worktree dev databases' },
  { branch: 'c', parent: 'b', pr: 298, state: 'open', title: 'Give each worktree its own ports' },
  { branch: 'd', parent: 'c', pr: 300, state: 'draft', title: 'Seed per-worktree fixtures' },
  { branch: 'e', parent: 'd', pr: 301, state: 'open', needsRestack: true, title: 'Session cookie per worktree' },
  { branch: 'f', parent: 'e', pr: 302, state: 'closed', title: 'Wellness productivity tracker' },
]
const STACKS: Record<Fixture, StackFixture> = {
  big: { current: 'c', nodes: big },
  small: { current: 'b', nodes: big.slice(0, 2) },
  forked: {
    current: 'c',
    nodes: [
      ...big.slice(0, 5),
      { branch: 'g', parent: 'c', pr: 304, state: 'draft', title: 'Try ports via env instead' },
      { branch: 'h', parent: 'd', pr: 305, state: 'open', title: 'Fixtures from a prod snapshot' },
    ],
  },
  none: { current: 'jake/scratch', nodes: null },
  nopr: {
    current: 'g',
    nodes: [...big.slice(0, 3), { branch: 'g', parent: 'c', title: 'WIP: tidy port helpers' }],
  },
}

// the circle carries PR state; bold + background mark the current row
const MARK: Record<PrState | 'none', { glyph: string; color?: string; dim?: boolean }> = {
  open: { glyph: '●', color: 'success' },
  draft: { glyph: '◯', color: 'inactive' },
  merged: { glyph: '✓', color: 'merged' },
  closed: { glyph: '✕', color: 'error' },
  none: { glyph: '◌', dim: true },
}
const mark = (n: Node) => MARK[n.pr ? (n.state ?? 'open') : 'none']

// Graphite's mark from Simple Icons (CC0); its brand black is lost on a dark
// band, so it is filled grey
const GRAPHITE_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa0a6" d="m15.215 0-12 3.215-3.215 12L8.785 24l12-3.215 3.215-12L15.215 0Zm1.958 20.966H6.827L1.655 12l5.172-8.966h10.346L22.345 12l-5.172 8.966Zm.68-14.823L9.86 4 4.006 9.858l2.14 8 7.995 2.141 5.853-5.857-2.14-8Z"/></svg>'

const forkHref = (at: string) => `https://fork.invalid/${at}`
// what gt state marks `trunk: true`
const TRUNK = 'main'

const graphite = (n: number) => `https://app.graphite.com/github/pr/bravely/demarest_mays/${n}`
const github = (n: number) => `https://github.com/bravely/demarest_mays/pull/${n}`

// `via`: the row was reached through a fork, child i of n at branch `at`
type Via = { at: string; i: number; n: number }
type Row = Node & { isCurrent: boolean; depth: number; kids: number; via?: Via }
type Shape = {
  rows: Row[] // bottom to top, what the band may show
  all: Row[] // every node, tree order, for the pane
  forkCount: number // children at the first fork above current (path rule)
}

function shape(f: StackFixture, rule: ForkRule, picks?: Record<string, number>): Shape | null {
  if (f.nodes === null) return null
  const nodes = f.nodes
  const byBranch = new Map(nodes.map(n => [n.branch, n]))
  const children = (b: string) => nodes.filter(n => n.parent === b)
  const row = (n: Node, depth = 0): Row => ({
    ...n,
    isCurrent: n.branch === f.current,
    depth,
    kids: children(n.branch).length,
  })

  const down: Row[] = []
  for (let n = byBranch.get(f.current); n; n = byBranch.get(n.parent)) down.unshift(row(n))

  const up: Row[] = []
  let forkCount = 0
  if (rule === 'path') {
    let kids = children(f.current)
    while (kids.length === 1) {
      up.push(row(kids[0]!))
      kids = children(kids[0]!.branch)
    }
    forkCount = kids.length > 1 ? kids.length : 0
  } else if (picks) {
    // one branch at a time: at each fork follow the picked child
    let kids = children(f.current)
    let at = f.current
    while (kids.length > 0) {
      const i = (picks[at] ?? 0) % kids.length
      const k = kids[i]!
      up.push({ ...row(k), via: kids.length > 1 ? { at, i, n: kids.length } : undefined })
      at = k.branch
      kids = children(at)
    }
  } else {
    // as gt log: the first child stays in its parent's lane, each later one
    // steps out a lane
    const walk = (b: string, lane: number) =>
      children(b).forEach((k, i) => {
        up.push(row(k, lane + (i > 0 ? 1 : 0)))
        walk(k.branch, lane + (i > 0 ? 1 : 0))
      })
    walk(f.current, 0)
  }

  const all: Row[] = []
  const tree = (b: string, depth: number) =>
    children(b).forEach(k => (all.push(row(k, depth)), tree(k.branch, depth + 1)))
  tree('main', 0)

  return { rows: [...down, ...up], all, forkCount }
}

// current PR and its neighbours, plus whether anything was cut
function window(rows: Row[]) {
  const i = rows.findIndex(r => r.isCurrent)
  const shown = rows.slice(Math.max(0, i - 1), i + 2)

  return { shown, isCut: shown.length < rows.length }
}

// the ladder's window: the parent, the current PR, and every child of it, so
// a fork right above the current PR shows each branch
function ladderWindow(rows: Row[]) {
  const cur = rows.find(r => r.isCurrent)
  const shown = rows.filter(
    r => r.isCurrent || r.branch === cur?.parent || r.parent === cur?.branch,
  )

  return { shown, isCut: shown.length < rows.length }
}

const label = (r: Row) => (r.pr ? `#${r.pr}` : 'no PR')

// ---- Openers --------------------------------------------------------------

// The desktop app builds the engine's env without .zshrc, where EDITOR is
// often set, so fall back to asking an interactive login shell (~0.7 s), once
let editorFromShell: string | undefined
async function editorCommand($: EngineInterface) {
  const fromEnv = (await $.env.get('VISUAL')) ?? (await $.env.get('EDITOR'))
  if (fromEnv) return fromEnv
  if (editorFromShell === undefined) {
    const shell = (await $.env.get('SHELL')) ?? '/bin/zsh'
    const r = await $.process
      .run([shell, '-ic', 'printf %s "${VISUAL:-$EDITOR}"'], { timeoutMs: 5_000 })
      .catch(() => undefined)
    editorFromShell = r?.exitCode === 0 ? r.stdout.trim() : ''
  }

  return editorFromShell || undefined
}

// this worktree: the git top level of the session's cwd
async function openEditor($: EngineInterface) {
  const cwd = await $.session.cwd()
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
  await openDir($, top.exitCode === 0 ? top.stdout.trim() : cwd)
}

// trunk: the worktree with trunk checked out, whichever it is; the main
// checkout may be on another branch, so the common dir's parent won't do
async function openTrunkEditor($: EngineInterface) {
  const cwd = await $.session.cwd()
  const list = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd })
  const entry = list.stdout
    .split('\n\n')
    .find(block => block.split('\n').includes(`branch refs/heads/${TRUNK}`))
  const dir = entry?.split('\n')[0]?.replace(/^worktree /, '')
  if (!dir) {
    $.ui.toast(`${TRUNK} isn't checked out in any worktree`)
    return
  }
  await openDir($, dir)
}

async function openDir($: EngineInterface, dir: string) {
  const raw = await editorCommand($)
  const argv = raw?.trim().split(/\s+/).filter(a => a !== '--wait' && a !== '-w') ?? []
  const cmd = argv.length ? [...argv, dir] : ['open', dir]
  const startedAt = await $.clock.now()
  $.ui.toast(`Running: ${cmd.join(' ')}`)
  void $.process.run(cmd, { timeoutMs: 15_000 }).then(
    async r => {
      const ms = (await $.clock.now()) - startedAt
      $.ui.toast(`${cmd[0]} exited ${r.exitCode} after ${ms} ms ${r.stderr.trim()}`)
    },
    err => $.ui.toast(`Couldn't open editor: ${String(err)}`),
  )
}

function openUrl($: EngineInterface, url: string) {
  void $.process.run(['open', url]).then(
    r => r.exitCode !== 0 && $.ui.toast(`open failed: ${r.stderr.trim()}`),
    err => $.ui.toast(`open failed: ${String(err)}`),
  )
}

const openPane = ($: EngineInterface, n: number) =>
  void $.ui.open({ id: PANE, title: `Stack (${n})` }).then(() => update($, isStackOpen, () => true))

// the engine's record of open panes, not the atom, decides: a pane outlives a
// reload, and the person may have closed it themselves
async function toggleStack($: EngineInterface, n: number) {
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isUp) {
    await $.ui.close({ id: PANE })
    // recorded here too: the ui.close hook alone left the button lit
    await update($, isStackOpen, () => false)
  } else {
    openPane($, n)
  }
}

const cycle = <T,>(list: T[], at: T) => list[(list.indexOf(at) + 1) % list.length]!

// ---- register -------------------------------------------------------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
    await update($, isStackOpen, () => isUp)

    return next(e)
  })

  // every close lands here: the button's, the pane's own mark or key, unload
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await update($, isStackOpen, () => false)

    return closed
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link, Markdown } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const v = await read($, variant)
    const fx = await read($, fixture)
    const rule = await read($, forkRule)
    const s = shape(STACKS[fx], rule)

    const editor = (
      <Button key="editor" label="‹/› Editor" onPress={() => openEditor($)} />
    )
    const isOpen = await read($, isStackOpen)
    const stackButton = (n: number) => (
      <Button
        key="stack"
        // a Button holds only text, so a glyph, not an Svg, for the sidebar
        label={`◨ Stack (${n})`}
        variant={isOpen ? 'primary' : undefined}
        dimColor={!isOpen}
        onPress={() => toggleStack($, n)}
      />
    )
    // links the mod answers itself, one line high where a native button would
    // stretch the row; the .invalid hrefs are never opened
    const editorLink = (id: string, open: () => void) => (
      <Markdown
        key={`editor-${id}`}
        text={`[‹/›](https://editor.invalid/${id})`}
        pressableLinks={[`https://editor.invalid/${id}`]}
        onLinkPress={open}
      />
    )
    const stackLink = (n: number) => (
      <Markdown
        key="stack"
        text={`[${isOpen ? '◧' : '◨'} Stack (${n})](https://stack.invalid/)`}
        pressableLinks={['https://stack.invalid/']}
        onLinkPress={() => toggleStack($, n)}
      />
    )
    const forkButton = (n: number) => (
      <Button key="fork" label={`⑂ ${n} above`} dimColor onPress={() => openPane($, n)} />
    )
    const noStack = <Text dimColor>not in a Stack</Text>

    let body
    if (v === 'A') {
      // Chip row: editor, then the window of PR buttons, then Stack (n)
      const w = s && window(s.rows)
      body = (
        <Box flexDirection="row" gap="xs" alignItems="center">
          {editor}
          <Text dimColor> │ </Text>
          {!s && noStack}
          {w &&
            w.shown.map(r => (
              <Button
                key={`pr-${r.branch}`}
                variant={r.isCurrent ? 'primary' : undefined}
                dimColor={!r.pr}
                onPress={() => (r.pr ? openUrl($, graphite(r.pr)) : $.ui.toast('No PR yet'))}
              >
                <Text bold={r.isCurrent}>{label(r)}</Text>
              </Button>
            ))}
          {s && s.forkCount > 0 && forkButton(s.forkCount)}
          {s && w && (w.isCut || s.all.length > s.rows.length) && stackButton(s.all.length)}
        </Box>
      )
    } else if (v === 'B') {
      // Breadcrumb trail: one line of inline Links, whole path, editor last
      body = (
        <Box flexDirection="row" gap="xs" alignItems="center">
          <Text>
            <Text dimColor>main</Text>
            {!s && <Text dimColor> › not in a Stack</Text>}
            {s &&
              s.rows.map(r => (
                <Text>
                  <Text dimColor> › </Text>
                  {r.pr ? (
                    <Text bold={r.isCurrent} backgroundColor={r.isCurrent ? 'promptBorder' : undefined}>
                      <Link href={graphite(r.pr)}>{label(r)}</Link>
                    </Text>
                  ) : (
                    <Text dimColor italic>
                      {r.title}
                    </Text>
                  )}
                </Text>
              ))}
            {s && s.forkCount > 0 && <Text dimColor> › ⑂{s.forkCount}</Text>}
          </Text>
          {s && s.all.length > s.rows.length && stackButton(s.all.length)}
          {editor}
        </Box>
      )
    } else if (v === 'C') {
      // Ladder: one row per PR, top first (as gt log), titles shown. Path
      // only: the window, the fork point marked. Every branch: the whole
      // picked path; a row reached through a fork carries "⑂ i/n" left of its
      // circle, which swaps that row (and all above it) for the next branch
      const picks = await read($, forkPicks)
      const sc = shape(STACKS[fx], rule, rule === 'all' ? picks : undefined)
      // the ladder runs from the top down to trunk, every row; a band too short
      // for it scrolls (the desktop's, not the mod's); Stack (n) is for what it
      // leaves out (unpicked branches)
      const shown = sc ? sc.rows : []
      const stepFork = (via: Via) =>
        update($, forkPicks, all => ({ ...all, [via.at]: (via.i + 1) % via.n }))
      body = (
        <Box flexDirection="column">
          <Box flexDirection="column" rowGap="xs">
          {!sc && (
            <Box flexDirection="row" gap="xs" alignItems="center" paddingX={1}>
              <Box width={4} flexShrink={0}>
                {editorLink('worktree', () => openEditor($))}
              </Box>
              {noStack}
            </Box>
          )}
          {[...shown].reverse().map(r => (
            <Box flexDirection="column">
              <Box
                flexDirection="row"
                gap="xs"
                alignItems="center"
                paddingX={1}
                backgroundColor={r.isCurrent ? 'promptBorder' : undefined}
              >
                {/* the gutter: ⑂ on a row reached through a fork, ‹/› on the
                    current row, which never is (forks resolve above it) */}
                <Box width={4} flexShrink={0}>
                    {r.isCurrent && editorLink('worktree', () => openEditor($))}
                    {r.via && (
                      // a link the mod answers itself: looks like the PR links,
                      // steps the fork; the .invalid href is never opened
                      <Markdown
                        key={`fork-${r.via.at}`}
                        text={`[⑂ ${r.via.i + 1}/${r.via.n}](${forkHref(r.via.at)})`}
                        pressableLinks={[forkHref(r.via.at)]}
                        onLinkPress={() => stepFork(r.via!)}
                      />
                    )}
                </Box>
                <Text color={mark(r).color} dimColor={mark(r).dim}>
                  {mark(r).glyph}
                </Text>
                {r.pr ? (
                  // an Svg can't sit inside a Link (nor Markdown draw an image
                  // on desktop), so the icon only abuts it, in a gapless Box
                  <Box flexDirection="row" alignItems="center" gap={0}>
                    {Svg && <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />}
                    <Link href={graphite(r.pr)}>
                      <Text bold={r.isCurrent}>{label(r)}</Text>
                    </Link>
                  </Box>
                ) : (
                  <Text dimColor>no PR</Text>
                )}
                <Text bold={r.isCurrent} dimColor={!r.isCurrent}>
                  {r.title}
                </Text>
                {r.needsRestack && (
                  <Text color="warning" dimColor>
                    ↻ restack
                  </Text>
                )}
                {rule === 'path' && r.kids > 1 && (
                  <Button
                    key={`fork-${r.branch}`}
                    label={`⑂ forks into ${r.kids}`}
                    dimColor
                    onPress={() => openPane($, sc!.all.length)}
                  />
                )}
              </Box>
            </Box>
          ))}
          {sc && (
            <Box flexDirection="row" gap="xs" alignItems="center" paddingX={1}>
              <Box width={4} flexShrink={0}>
                {editorLink('trunk', () => openTrunkEditor($))}
              </Box>
              <Text dimColor>┴ {TRUNK}</Text>
              {sc.all.length > shown.length && stackLink(sc.all.length)}
            </Box>
          )}
          </Box>
        </Box>
      )
    } else {
      // One button + pane: the band names the current PR; the Stack lives in the pane
      const cur = s?.rows.find(r => r.isCurrent)
      body = (
        <Box flexDirection="row" gap="xs" alignItems="center">
          {editor}
          {!s && noStack}
          {s && cur && (
            <Button key="current" variant="primary" onPress={() => openPane($, s.all.length)}>
              <Text bold>{label(cur)}</Text> <Text>{cur.title}</Text>{' '}
              <Text dimColor>
                · {s.rows.findIndex(r => r.isCurrent) + 1} of {s.all.length}
              </Text>
            </Button>
          )}
          {cur?.pr && <Link href={graphite(cur.pr)}>Graphite ↗</Link>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {body}
        <Box flexDirection="row" gap="xs" alignItems="center" marginTop={1}>
          <Text dimColor>prototype ·</Text>
          <Button
            key="variant"
            hotkey="v"
            dimColor
            label={`${v}: ${VARIANT_NAMES[v]} ▸`}
            onPress={() => update($, variant, at => cycle(VARIANTS, at))}
          />
          <Button
            key="fixture"
            hotkey="d"
            dimColor
            label={`data: ${FIXTURE_NAMES[fx]} ▸`}
            onPress={() => update($, fixture, at => cycle(FIXTURES, at))}
          />
          <Button
            key="fork"
            hotkey="f"
            dimColor
            label={`fork rule: ${rule === 'path' ? 'path only' : 'all descendants'} ▸`}
            onPress={() => update($, forkRule, at => (at === 'path' ? 'all' : 'path'))}
          />
        </Box>
      </Box>
    )
  })

  // the full Stack, tree order, GitHub and Graphite links per PR
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const s = shape(STACKS[await read($, fixture)], 'all')
    if (!s) return <Text dimColor>Not in a Stack.</Text>

    return (
      <Box flexDirection="column">
        <Text dimColor>main</Text>
        {s.all.map(r => (
          <Box
            flexDirection="row"
            gap="xs"
            paddingLeft={r.depth * 2}
            backgroundColor={r.isCurrent ? 'promptBorder' : undefined}
          >
            <Text color={mark(r).color} dimColor={mark(r).dim}>
                  {mark(r).glyph}
                </Text>
            <Text bold={r.isCurrent}>{label(r)}</Text>
            <Text bold={r.isCurrent}>{r.title}</Text>
            {r.needsRestack && (
              <Text color="warning" dimColor>
                ↻ restack
              </Text>
            )}
            {r.pr && <Link href={github(r.pr)}>GitHub</Link>}
            {r.pr && <Link href={graphite(r.pr)}>Graphite</Link>}
          </Box>
        ))}
      </Box>
    )
  })
}
