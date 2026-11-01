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

type Node = { branch: string; parent: string; pr?: number; title: string }
type StackFixture = { current: string; nodes: Node[] } | { current: string; nodes: null }

const big: Node[] = [
  { branch: 'a', parent: 'main', pr: 295, title: 'Split settings into sections' },
  { branch: 'b', parent: 'a', pr: 297, title: 'Add worktree dev databases' },
  { branch: 'c', parent: 'b', pr: 298, title: 'Give each worktree its own ports' },
  { branch: 'd', parent: 'c', pr: 300, title: 'Seed per-worktree fixtures' },
  { branch: 'e', parent: 'd', pr: 301, title: 'Session cookie per worktree' },
  { branch: 'f', parent: 'e', pr: 302, title: 'Wellness productivity tracker' },
]
const STACKS: Record<Fixture, StackFixture> = {
  big: { current: 'c', nodes: big },
  small: { current: 'b', nodes: big.slice(0, 2) },
  forked: {
    current: 'c',
    nodes: [
      ...big.slice(0, 5),
      { branch: 'g', parent: 'c', pr: 304, title: 'Try ports via env instead' },
    ],
  },
  none: { current: 'jake/scratch', nodes: null },
  nopr: {
    current: 'g',
    nodes: [...big.slice(0, 3), { branch: 'g', parent: 'c', title: 'WIP: tidy port helpers' }],
  },
}

const graphite = (n: number) => `https://app.graphite.com/github/pr/bravely/demarest_mays/${n}`
const github = (n: number) => `https://github.com/bravely/demarest_mays/pull/${n}`

type Row = Node & { isCurrent: boolean; depth: number }
type Shape = {
  rows: Row[] // bottom to top, what the band may show
  all: Row[] // every node, tree order, for the pane
  forkCount: number // children at the first fork above current (path rule)
}

function shape(f: StackFixture, rule: ForkRule): Shape | null {
  if (f.nodes === null) return null
  const nodes = f.nodes
  const byBranch = new Map(nodes.map(n => [n.branch, n]))
  const children = (b: string) => nodes.filter(n => n.parent === b)
  const row = (n: Node, depth = 0): Row => ({ ...n, isCurrent: n.branch === f.current, depth })

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
  } else {
    const walk = (b: string) => children(b).forEach(k => (up.push(row(k)), walk(k.branch)))
    walk(f.current)
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

const label = (r: Row) => (r.pr ? `#${r.pr}` : 'no PR')

// ---- Openers --------------------------------------------------------------

async function openEditor($: EngineInterface) {
  const cwd = await $.session.cwd()
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
  const dir = top.exitCode === 0 ? top.stdout.trim() : cwd
  const raw = (await $.env.get('VISUAL')) ?? (await $.env.get('EDITOR'))
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
  void $.ui.open({ id: PANE, title: `Stack (${n})` })

const cycle = <T,>(list: T[], at: T) => list[(list.indexOf(at) + 1) % list.length]!

// ---- register -------------------------------------------------------------

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const v = await read($, variant)
    const fx = await read($, fixture)
    const rule = await read($, forkRule)
    const s = shape(STACKS[fx], rule)

    const editor = (
      <Button key="editor" label="Open in editor" hotkey="e" onPress={() => openEditor($)} />
    )
    const stackButton = (n: number) => (
      <Button key="stack" label={`Stack (${n})`} dimColor onPress={() => openPane($, n)} />
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
      // Ladder: one row per PR, top of the window first (as gt log), titles shown
      const w = s && window(s.rows)
      body = (
        <Box flexDirection="column">
          <Box flexDirection="row" gap="xs" alignItems="center">
            {editor}
            {s && w && (w.isCut || s.all.length > s.rows.length) && stackButton(s.all.length)}
            {s && s.forkCount > 0 && forkButton(s.forkCount)}
            {!s && noStack}
          </Box>
          {w &&
            [...w.shown].reverse().map(r => (
              <Box
                flexDirection="row"
                gap="xs"
                paddingX={1}
                backgroundColor={r.isCurrent ? 'promptBorder' : undefined}
              >
                <Text dimColor>{r.isCurrent ? '◉' : '◯'}</Text>
                {r.pr ? (
                  <Link href={graphite(r.pr)}>
                    <Text bold={r.isCurrent}>{label(r)}</Text>
                  </Link>
                ) : (
                  <Text dimColor>no PR</Text>
                )}
                <Text bold={r.isCurrent} dimColor={!r.isCurrent}>
                  {r.title}
                </Text>
              </Box>
            ))}
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
            <Text dimColor>{r.isCurrent ? '◉' : '◯'}</Text>
            <Text bold={r.isCurrent}>{label(r)}</Text>
            <Text bold={r.isCurrent}>{r.title}</Text>
            {r.pr && <Link href={github(r.pr)}>GitHub</Link>}
            {r.pr && <Link href={graphite(r.pr)}>Graphite</Link>}
          </Box>
        ))}
      </Box>
    )
  })
}
