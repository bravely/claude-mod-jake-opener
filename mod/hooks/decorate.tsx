import type { MatchedHook } from 'claude-code'

import type { PrRef } from '../types'
import { GITHUB_PR, GITHUB_SVG, GRAPHITE_SVG, githubUrl, graphiteUrl, parsePrUrl } from './pr'

const FENCE = /^\s*(```|~~~)/
// what may follow the number: `/files`, an anchor; no `.`, so a full stop
// after a bare URL stays text
const PATH = String.raw`(?:/[\w/#?=&%-]*)?`
const END = String.raw`(?![\w/#?=&%-])`

// A code span is matched only to be left alone. A markdown link counts once
// its `)` has streamed in and an autolink once its `>` has; a bare URL is never
// the inside of either.
const SCAN = new RegExp(
  [
    String.raw`(?<code>(\`+)[^\n]*?\2)`,
    String.raw`\[(?<label>[^\]\n]*)\]\((?<linked>${GITHUB_PR}${PATH})${END}\)`,
    String.raw`<(?<auto>${GITHUB_PR}${PATH})${END}>`,
    String.raw`(?<![\w/<])(?<!\]\()(?<bare>${GITHUB_PR}${PATH})${END}`,
  ].join('|'),
  'g',
)

type Groups = { code?: string; label?: string; linked?: string; auto?: string; bare?: string }

// The reply's text with a Graphite link after each PR link, and every PR it
// mentions, first mention first. Code is left as written.
export function decorateText(text: string): { text: string; prs: PrRef[] } {
  const prs = new Map<string, PrRef>()
  let isFenced = false
  const lines = text.split('\n').map(line => {
    if (FENCE.test(line)) {
      isFenced = !isFenced
      return line
    }
    if (isFenced) return line

    return line.replace(SCAN, (whole: string, ...rest: unknown[]) => {
      const g = rest.at(-1) as Groups
      if (g.code !== undefined) return whole
      const url = (g.linked ?? g.auto ?? g.bare)!
      const pr = parsePrUrl(url)!
      if (!prs.has(githubUrl(pr))) prs.set(githubUrl(pr), pr)
      const link = g.linked === undefined ? `[${pr.repo}#${pr.number}](${url})` : whole

      return `${link} [⬡ Graphite](${graphiteUrl(pr)})`
    })
  })

  return { text: lines.join('\n'), prs: [...prs.values()] }
}

export const decorateReply: MatchedHook<'ui.render', { component: 'AssistantMessage' }> = async (
  $,
  e,
  next,
) => {
  if (e.surface !== 'desktop' || e.props.isSummary) return next(e)
  const { text, prs } = decorateText(e.props.text)
  if (prs.length === 0) return next(e)

  const drawn = await next({ ...e, props: { ...e.props, text } })
  const { Box, Link, Svg, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column" gap="xs">
      {drawn}
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
        {prs.map((pr, i) => (
          // keys must be unique across the whole tree, the reply's included
          <Box key={githubUrl(pr)} flexDirection="row" alignItems="center" columnGap={1}>
            {i > 0 && <Text dimColor>·</Text>}
            <Box flexDirection="row" alignItems="center">
              <Svg source={GITHUB_SVG} alt="GitHub" width={14} height={14} />
              <Link href={githubUrl(pr)}>#{pr.number}</Link>
              <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />
              <Link href={graphiteUrl(pr)}>↗</Link>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
