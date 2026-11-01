// PROTOTYPE, throw away. Answers "How should PR link decoration look?"
// (bravely/claude-mod-jake-opener#7). Four variants of decorating GitHub PR
// links in assistant replies on the desktop, switched from a prototype-only
// pane. A dim line under each decorated block names the variant.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Variant } from '../types'

const variant = atom({ plugin: 'pr-link-decoration-prototype', key: 'variant' } as const, 'A' as Variant)

const PANE = 'variants'
const VARIANTS: Variant[] = ['A', 'B', 'C', 'D']
const VARIANT_NAMES: Record<Variant, string> = {
  A: 'Rows under the reply',
  B: 'Inline text link',
  C: 'Inline text link + icon strip',
  D: 'Redrawn lines, icons beside links',
}

// Octicons' mark-github (MIT), grey so it reads on light and dark
const GITHUB_SVG =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa0a6" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>'
// Graphite's mark from Simple Icons (CC0), as in the band prototype
const GRAPHITE_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa0a6" d="m15.215 0-12 3.215-3.215 12L8.785 24l12-3.215 3.215-12L15.215 0Zm1.958 20.966H6.827L1.655 12l5.172-8.966h10.346L22.345 12l-5.172 8.966Zm.68-14.823L9.86 4 4.006 9.858l2.14 8 7.995 2.141 5.853-5.857-2.14-8Z"/></svg>'

type Pr = { url: string; owner: string; repo: string; n: number; label?: string }

const graphite = (pr: Pr) => `https://app.graphite.com/github/pr/${pr.owner}/${pr.repo}/${pr.n}`
const short = (pr: Pr) => `${pr.repo}#${pr.n}`

// a markdown link to a PR, or a bare / autolinked PR URL
const PR_RE =
  /\[([^\]\n]*)\]\((https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)[^)\s]*)\)|<?(https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)[\w/#?=&-]*)>?/g

type Piece = { kind: 'text'; text: string } | { kind: 'pr'; raw: string; pr: Pr }

// a line split into plain markdown and PR links
const splitLine = (line: string): Piece[] => {
  const out: Piece[] = []
  let at = 0
  for (const m of line.matchAll(PR_RE)) {
    if (m.index! > at) out.push({ kind: 'text', text: line.slice(at, m.index) })
    const pr: Pr = m[2]
      ? { url: m[2], owner: m[3]!, repo: m[4]!, n: Number(m[5]), label: m[1] }
      : { url: m[6]!, owner: m[7]!, repo: m[8]!, n: Number(m[9]) }
    out.push({ kind: 'pr', raw: m[0], pr })
    at = m.index! + m[0].length
  }
  if (at < line.length) out.push({ kind: 'text', text: line.slice(at) })
  return out
}

// lines outside code fences, tagged so fenced lines are left alone
const lines = (text: string) => {
  let fenced = false
  return text.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      return { line, code: true }
    }
    return { line, code: fenced }
  })
}

const findPrs = (text: string): Pr[] => {
  const seen = new Map<string, Pr>()
  for (const { line, code } of lines(text)) {
    if (code) continue
    for (const p of splitLine(line)) {
      if (p.kind === 'pr' && !seen.has(graphite(p.pr))) seen.set(graphite(p.pr), p.pr)
    }
  }
  return [...seen.values()]
}

// B and C: a text Graphite link right after each PR link
const rewrite = (text: string) =>
  lines(text)
    .map(({ line, code }) =>
      code
        ? line
        : splitLine(line)
            .map(p =>
              p.kind === 'text'
                ? p.text
                : `${p.pr.label !== undefined ? p.raw : `[${short(p.pr)}](${p.pr.url})`} [⬡ Graphite](${graphite(p.pr)})`,
            )
            .join(''),
    )
    .join('\n')

export const register: Register = on => {
  // the switcher pane is prototype scaffolding, not part of the mod
  on('session.start', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: 'PR link decoration (prototype)' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const cur = await read($, variant)
    return (
      <Box flexDirection="column" gap="xs">
        <Text dimColor>Pick a variant; replies with PR links redraw.</Text>
        {VARIANTS.map(v => (
          <Button key={v} onPress={() => void update($, variant, () => v)}>
            <Text bold={v === cur}>
              {v === cur ? '● ' : '○ '}
              {v} · {VARIANT_NAMES[v]}
            </Text>
          </Button>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.isSummary) return next(e)
    const prs = findPrs(e.props.text)
    if (prs.length === 0) return next(e)

    const v = await read($, variant)
    const { Box, Text, Link, Svg, Markdown } = $.ui.resolve(e)
    const gh = <Svg source={GITHUB_SVG} alt="GitHub" width={14} height={14} />
    const gt = <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />
    const tag = (
      <Text dimColor>
        prototype {v}: {VARIANT_NAMES[v]}
      </Text>
    )

    if (v === 'A') {
      const drawn = await next(e)
      return (
        <Box flexDirection="column" gap="xs">
          {drawn}
          {prs.map(pr => (
            <Box key={pr.url} flexDirection="row" alignItems="center" gap={1}>
              {gh}
              <Link href={pr.url}>{short(pr)}</Link>
              {gt}
              <Link href={graphite(pr)}>Graphite</Link>
            </Box>
          ))}
          {tag}
        </Box>
      )
    }

    if (v === 'B' || v === 'C') {
      const drawn = await next({ ...e, props: { ...e.props, text: rewrite(e.props.text) } })
      return (
        <Box flexDirection="column" gap="xs">
          {drawn}
          {v === 'C' && (
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
              {prs.flatMap((pr, i) => [
                ...(i > 0 ? [<Text key={`s${i}`} dimColor>·</Text>] : []),
                <Box key={pr.url} flexDirection="row" alignItems="center">
                  {gh}
                  <Link href={pr.url}>#{pr.n}</Link>
                  {gt}
                  <Link href={graphite(pr)}>↗</Link>
                </Box>,
              ])}
            </Box>
          )}
          {tag}
        </Box>
      )
    }

    // D: draw the reply ourselves; plain runs of lines stay one Markdown,
    // each line holding a PR link becomes a wrapping row of pieces
    const blocks: JSX.Element[] = []
    let run: string[] = []
    const flush = () => {
      if (run.length) blocks.push(<Markdown key={`m${blocks.length}`} text={run.join('\n')} />)
      run = []
    }
    for (const { line, code } of lines(e.props.text)) {
      const pieces = code ? [] : splitLine(line)
      if (!pieces.some(p => p.kind === 'pr')) {
        run.push(line)
        continue
      }
      flush()
      const at = blocks.length
      blocks.push(
        <Box key={`l${at}`} flexDirection="row" flexWrap="wrap" alignItems="center">
          {pieces.map((p, i) =>
            p.kind === 'text' ? (
              <Markdown key={`l${at}t${i}`} text={p.text} />
            ) : (
              <Box key={`l${at}p${i}`} flexDirection="row" alignItems="center">
                {gh}
                <Link href={p.pr.url}>{p.pr.label || short(p.pr)}</Link>
                {gt}
                <Link href={graphite(p.pr)}>Graphite</Link>
              </Box>
            ),
          )}
        </Box>,
      )
    }
    flush()
    return (
      <Box flexDirection="column" gap="xs">
        {blocks}
        {tag}
      </Box>
    )
  })
}
