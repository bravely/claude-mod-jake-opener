// PROTOTYPE, throw away. Answers "What should the band show with no Stack, or
// a broken one?" (bravely/claude-mod-jake-opener#11). The ladder decided in #6,
// redrawn for each edge case as a fixture; cycle them with "case ▸" (hotkey d),
// and where a case has two looks worth comparing, flip them with "look ▸"
// (hotkey v). Every ‹/› and PR link is real enough to click: ‹/› opens this
// worktree in the editor, PR numbers open Graphite.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Case, Look } from '../types'

const caseAtom = atom({ plugin: 'openers-band-edges', key: 'case' } as const, 'trunk' as Case)
const lookAtom = atom({ plugin: 'openers-band-edges', key: 'look' } as const, 'A' as Look)

// ---- fixtures ---------------------------------------------------------------

type PrState = 'open' | 'draft' | 'merged' | 'closed'
type Row = {
  branch: string
  pr?: number
  state?: PrState
  needsRestack?: boolean
  title: string
  isCurrent?: boolean
  // where the PR came from: gt's cache, or `gh` filling a gap
  source?: 'cache' | 'gh'
  // PR unknown: gh hasn't answered (pending) or failed (unknown)
  prLookup?: 'pending' | 'unknown'
  // a dim italic aside after the title, as on case 1's trunk row
  note?: string
  // a problem, not an aside: red, not dim
  isNoteError?: boolean
  // a link that drafts a prompt for Claude into the prompt box
  ask?: { label: string; prompt: string }
  // the current row's highlight when it carries a problem
  errorBg?: 'diffRemovedDimmed' | 'diffRemoved'
  // a command link after the note, answered by the mod (a toast here)
  action?: Action
}
type Action = { label: string; cmd: string[] }
const TRACK: Action = { label: 'gt track', cmd: ['gt', 'track', '--parent', 'main'] }
const RESTACK: Action = { label: '↻ restack', cmd: ['gt', 'restack', '--no-interactive'] }
const SYNC: Action = { label: 'gt sync', cmd: ['gt', 'sync', '--no-interactive'] }

type Fixture = {
  name: string
  // what detects it, shown dim under the band so the reaction can weigh it
  signal: string
  // the two looks, when the case has a choice; A is the ticket's proposal
  looks?: { A: string; B: string }
  draw: (look: Look) => Drawn
}

// what the band draws, top to bottom
type Drawn =
  | { kind: 'none' } // no band at all
  | {
      kind: 'ladder'
      rows: Row[]
      trunk?: { isCurrent?: boolean; note?: string; problem?: string; action?: Action }
      // the current row when it isn't a PR row: detached, untracked, etc.
      loose?: { glyph: string; text: string; note?: string; action?: Action }
      hint?: string // one dim line at the foot
      isHintError?: boolean // the hint is a problem: red, not dim
      hintAction?: Action // a command link after the hint
      cacheAge?: string // shown after ┴ main
      folderOnly?: string // not a repo: just ‹/› and the folder
    }

const stack: Row[] = [
  { branch: 'a', pr: 295, state: 'open', title: 'Split settings into sections' },
  { branch: 'b', pr: 297, state: 'open', title: 'Add worktree dev databases', isCurrent: true },
  { branch: 'c', pr: 298, state: 'draft', title: 'Give each worktree its own ports' },
]
const top = (rows: Row[]) => [...rows].reverse()

const FIXTURES: Record<Case, Fixture> = {
  trunk: {
    name: 'On trunk',
    signal: 'current branch is the one gt state marks trunk: true',
    looks: { A: 'trunk row only, as current', B: 'trunk row with (trunk) and an inline hint' },
    draw: look => ({
      kind: 'ladder',
      rows: [],
      trunk: { isCurrent: true, note: look === 'B' ? 'gt create to start a Stack' : undefined },
    }),
  },
  untracked: {
    name: 'Branch gt doesn’t track',
    signal: 'current branch absent from gt state',
    looks: { A: 'no PR yet', B: 'has a PR (from gh): a normal row, Graphite link and all' },
    draw: look =>
      look === 'A'
        ? {
            kind: 'ladder',
            rows: [],
            loose: { glyph: '◌', text: 'jake/scratch', note: 'not tracked', action: TRACK },
            trunk: {},
          }
        : {
            kind: 'ladder',
            rows: [
              {
                branch: 'jake/scratch',
                pr: 310,
                state: 'open',
                title: 'Scratch: try a new seed script',
                isCurrent: true,
                source: 'gh',
                note: 'not tracked',
                action: TRACK,
              },
            ],
            trunk: {},
          },
  },
  detached: {
    name: 'Detached HEAD',
    signal: 'git rev-parse --abbrev-ref HEAD prints HEAD',
    looks: { A: 'detached row, no trunk row', B: 'detached row + trunk row' },
    draw: look => ({
      kind: 'ladder',
      rows: [],
      loose: { glyph: '◌', text: 'detached at 1e806cb' },
      trunk: look === 'B' ? {} : undefined,
    }),
  },
  rebasing: {
    name: 'Rebase stopped on a conflict',
    signal: 'HEAD detached and <git-dir>/rebase-merge/head-name (or rebase-apply/) names the branch',
    looks: { A: 'soft red row (diffRemovedDimmed)', B: 'strong red row (diffRemoved)' },
    draw: look => ({
      kind: 'ladder',
      rows: top([
        stack[0]!,
        {
          ...stack[1]!,
          note: 'rebase stopped on a conflict',
          isNoteError: true,
          errorBg: look === 'A' ? 'diffRemovedDimmed' : 'diffRemoved',
          ask: {
            label: 'fix it',
            prompt: 'The restack of b stopped on a conflict. Resolve it and continue the restack.',
          },
        },
        stack[2]!,
      ]),
      trunk: {},
    }),
  },
  nogt: {
    name: 'gt missing / repo not initialised',
    signal: 'gt state exits non-zero, or .graphite_repo_config absent',
    draw: () => ({
      kind: 'ladder',
      rows: [
        {
          branch: 'feature',
          pr: 312,
          state: 'open',
          title: 'Add CSV export',
          isCurrent: true,
          source: 'gh',
        },
      ],
      // trunk from origin/HEAD: without gt there's no `trunk: true` to read
      trunk: {
        problem: 'gt not initialised here',
        action: { label: 'gt init', cmd: ['gt', 'init', '--trunk', 'main'] },
      },
    }),
  },
  norepo: {
    name: 'Not a git repo',
    signal: 'git rev-parse --show-toplevel exits non-zero',
    looks: { A: '‹/› for the session folder', B: 'no band at all' },
    draw: look =>
      look === 'A'
        ? { kind: 'ladder', rows: [], folderOnly: '~/Downloads/notes' }
        : { kind: 'none' },
  },
  merged: {
    name: 'Merged PR below current, not yet synced',
    signal: 'cache: PR state MERGED on a branch still in gt state',
    draw: () => ({
      kind: 'ladder',
      rows: top([
        { ...stack[0]!, state: 'merged', action: SYNC },
        { ...stack[1]!, needsRestack: true },
        stack[2]!,
      ]),
      trunk: {},
    }),
  },
  closed: {
    name: 'Closed PR mid-Stack',
    signal: 'cache: PR state CLOSED',
    draw: () => ({
      kind: 'ladder',
      rows: top([stack[0]!, { ...stack[1]!, state: 'closed' }, stack[2]!]),
      trunk: {},
    }),
  },
  cachemiss: {
    name: 'Branch the cache has no PR for',
    signal: '.graphite_pr_info lacks the branch; gh pr list fills it',
    looks: { A: 'gh pending: "PR …"', B: 'gh failed: "PR ?"' },
    draw: look => ({
      kind: 'ladder',
      rows: top([
        stack[0]!,
        stack[1]!,
        {
          branch: 'd',
          title: 'Seed per-worktree fixtures',
          prLookup: look === 'A' ? 'pending' : 'unknown',
          ...(look === 'B' && {
            note: 'gh pr list failed: HTTP 401 Bad credentials',
            isNoteError: true,
          }),
        },
      ]),
      trunk: {},
    }),
  },
  nocache: {
    name: 'gt’s PR cache missing or stale',
    signal: '.graphite_pr_info absent, or its mtime old',
    looks: { A: 'states from gh, no age shown', B: 'cache age on the trunk row' },
    draw: look => ({
      kind: 'ladder',
      rows: top(stack.map(r => ({ ...r, source: look === 'A' ? 'gh' : 'cache' }))),
      trunk: {},
      cacheAge: look === 'B' ? 'PR states 52 min old' : undefined,
    }),
  },
}
const CASES = Object.keys(FIXTURES) as Case[]

// ---- drawing bits -----------------------------------------------------------

const MARK: Record<PrState | 'none', { glyph: string; color?: string; dim?: boolean }> = {
  open: { glyph: '●', color: 'success' },
  draft: { glyph: '◯', color: 'inactive' },
  merged: { glyph: '✓', color: 'merged' },
  closed: { glyph: '✕', color: 'error' },
  none: { glyph: '◌', dim: true },
}
const mark = (r: Row) => MARK[r.pr ? (r.state ?? 'open') : 'none']

const GRAPHITE_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa0a6" d="m15.215 0-12 3.215-3.215 12L8.785 24l12-3.215 3.215-12L15.215 0Zm1.958 20.966H6.827L1.655 12l5.172-8.966h10.346L22.345 12l-5.172 8.966Zm.68-14.823L9.86 4 4.006 9.858l2.14 8 7.995 2.141 5.853-5.857-2.14-8Z"/></svg>'
const graphite = (n: number) => `https://app.graphite.com/github/pr/bravely/demarest_mays/${n}`
const TRUNK = 'main'

// ---- the one real Opener ----------------------------------------------------

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

async function openEditor($: EngineInterface) {
  const cwd = await $.session.cwd()
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
  const dir = top.exitCode === 0 ? top.stdout.trim() : cwd
  const raw = await editorCommand($)
  const argv = raw?.trim().split(/\s+/).filter(a => a !== '--wait' && a !== '-w') ?? []
  const cmd = argv.length ? [...argv, dir] : ['open', dir]
  void $.process.run(cmd, { timeoutMs: 15_000 }).catch(err => $.ui.toast(`Worktree editor: ${String(err)}`))
}

const cycle = <T,>(list: T[], at: T) => list[(list.indexOf(at) + 1) % list.length]!

// ---- register ---------------------------------------------------------------

export const register: Register = on => {
  // a hot reload on the desktop didn't redraw the band until the next input;
  // ask for one as the reloaded module starts
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    $.ui.invalidate('ui.render')

    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link, Markdown } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const c = await read($, caseAtom)
    const look = await read($, lookAtom)
    const fx = FIXTURES[c]
    const d = fx.draw(fx.looks ? look : 'A')

    const editorLink = (id: string, open: () => void) => (
      <Markdown
        key={`editor-${id}`}
        text={`[‹/›](https://editor.invalid/${id})`}
        pressableLinks={[`https://editor.invalid/${id}`]}
        onLinkPress={open}
      />
    )
    // PROTOTYPE: a toast stands in for running the command in the worktree
    const actionLink = (a: Action) => (
      <Markdown
        key={`action-${a.label}`}
        text={`[${a.label}](https://action.invalid/${a.cmd.join('-')})`}
        pressableLinks={[`https://action.invalid/${a.cmd.join('-')}`]}
        onLinkPress={() => $.ui.toast(`would run: ${a.cmd.join(' ')}`)}
      />
    )
    const gutter = (child?: RenderChildren) => (
      <Box width={4} flexShrink={0}>
        {child}
      </Box>
    )
    const rowBox = (
      key: string,
      isCurrent: boolean,
      kids: RenderChildren,
      errorBg?: Row['errorBg'],
    ) => (
      <Box
        key={key}
        flexDirection="row"
        gap="xs"
        alignItems="center"
        paddingX={1}
        backgroundColor={isCurrent ? (errorBg ?? 'promptBorder') : undefined}
      >
        {kids}
      </Box>
    )

    const prRow = (r: Row) => {
      const isGone = r.state === 'merged' || r.state === 'closed'
      return rowBox(r.branch, !!r.isCurrent, [
        gutter(r.isCurrent ? editorLink('worktree', () => openEditor($)) : undefined),
        <Text color={mark(r).color} dimColor={mark(r).dim}>
          {mark(r).glyph}
        </Text>,
        r.pr ? (
          <Box flexDirection="row" alignItems="center" gap={0}>
            {Svg && <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />}
            <Link href={graphite(r.pr)}>
              <Text bold={r.isCurrent}>#{r.pr}</Text>
            </Link>
          </Box>
        ) : (
          r.prLookup === 'unknown' ? (
            <Text color="error">PR ?</Text>
          ) : (
            <Text dimColor>{r.prLookup === 'pending' ? 'PR …' : 'no PR'}</Text>
          )
        ),
        <Text bold={r.isCurrent} dimColor={!r.isCurrent || isGone} strikethrough={isGone && !r.isCurrent}>
          {r.title}
        </Text>,
        r.needsRestack && actionLink(RESTACK),
        r.note &&
          (r.isNoteError ? (
            <Text color="error">· {r.note}</Text>
          ) : (
            <Text dimColor italic>
              · {r.note}
            </Text>
          )),
        r.action && actionLink(r.action),
        r.ask && (
          // a real fill: the draft lands in the prompt box, unsent
          <Markdown
            key={`ask-${r.branch}`}
            text={`[${r.ask.label}](https://ask.invalid/${r.branch})`}
            pressableLinks={[`https://ask.invalid/${r.branch}`]}
            onLinkPress={() => void $.prompt.fill({ text: r.ask!.prompt })}
          />
        ),
      ], r.errorBg)
    }

    let body
    if (d.kind === 'none') {
      body = <Text dimColor>(no band drawn; this line is the prototype’s)</Text>
    } else if (d.folderOnly) {
      body = rowBox('folder', false, [
        gutter(editorLink('folder', () => openEditor($))),
        <Text dimColor>{d.folderOnly}</Text>,
      ])
    } else {
      body = (
        <Box flexDirection="column" rowGap="xs">
          {d.rows.map(prRow)}
          {d.loose &&
            rowBox('loose', true, [
              gutter(editorLink('worktree', () => openEditor($))),
              <Text dimColor>{d.loose.glyph}</Text>,
              <Text bold>{d.loose.text}</Text>,
              d.loose.note && (
                <Text dimColor italic>
                  · {d.loose.note}
                </Text>
              ),
              d.loose.action && actionLink(d.loose.action),
            ])}
          {d.trunk &&
            rowBox('trunk', !!d.trunk.isCurrent, [
              gutter(editorLink(d.trunk.isCurrent ? 'worktree' : 'trunk', () => openEditor($))),
              // one Text, so the row's gap doesn't split "main(trunk)"
              <Text>
                <Text bold={d.trunk.isCurrent} dimColor={!d.trunk.isCurrent}>
                  ┴ {TRUNK}
                </Text>
                {d.trunk.note && <Text dimColor>(trunk)</Text>}
              </Text>,
              d.trunk.note && (
                <Text dimColor italic>
                  · {d.trunk.note}
                </Text>
              ),
              d.cacheAge && <Text dimColor>· {d.cacheAge}</Text>,
              d.trunk.problem && <Text color="error">· {d.trunk.problem}</Text>,
              d.trunk.action && actionLink(d.trunk.action),
            ])}
          {d.hint && (
            <Box paddingX={1} flexDirection="row" gap="xs">
              {gutter()}
              {d.isHintError ? (
                <Text color="error">{d.hint}</Text>
              ) : (
                <Text dimColor italic>
                  {d.hint}
                </Text>
              )}
              {d.hintAction && actionLink(d.hintAction)}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {body}
        <Box flexDirection="row" gap="xs" alignItems="center" marginTop={1}>
          <Text dimColor>prototype ·</Text>
          <Button
            key="case"
            hotkey="d"
            dimColor
            label={`case ${CASES.indexOf(c) + 1}/${CASES.length}: ${fx.name} ▸`}
            onPress={() => update($, caseAtom, at => cycle(CASES, at))}
          />
          {fx.looks && (
            <Button
              key="look"
              hotkey="v"
              dimColor
              label={`look ${look}: ${fx.looks[look]} ▸`}
              onPress={() => update($, lookAtom, at => (at === 'A' ? 'B' : 'A'))}
            />
          )}
        </Box>
        <Text dimColor>signal: {fx.signal}</Text>
      </Box>
    )
  })
}
