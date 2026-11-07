import type { ThemeKey } from 'claude-code'

import type { PrRef, PrState } from '../types'

const NAME = String.raw`[\w.-]+`

// A GitHub PR URL up to its number, with no groups, for scanning text.
export const GITHUB_PR = String.raw`https://github\.com/${NAME}/${NAME}/pull/\d+`

const PR_URL = new RegExp(
  String.raw`^https://(?:github\.com/(${NAME})/(${NAME})/pull|app\.graphite\.com/github/pr/(${NAME})/(${NAME}))/(\d+)(?:[/?#]|$)`,
)

// gt's cache spells a PR as its Graphite link, gh and ccd_pr as its GitHub URL
export function parsePrUrl(url: string): PrRef | undefined {
  const m = PR_URL.exec(url)
  if (!m) return undefined

  return { owner: (m[1] ?? m[3])!, repo: (m[2] ?? m[4])!, number: Number(m[5]) }
}

// ccd_pr's `repo` is `owner/name`
export function prFromRepo(repo: string, number: number): PrRef | undefined {
  const [owner, name, ...rest] = repo.split('/')

  return owner && name && rest.length === 0 ? { owner, repo: name, number } : undefined
}

export const githubUrl = (pr: PrRef) => `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`

export const graphiteUrl = (pr: PrRef) =>
  `https://app.graphite.com/github/pr/${pr.owner}/${pr.repo}/${pr.number}`

// Octicons' mark-github (MIT), grey so it reads on light and dark
export const GITHUB_SVG =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa0a6" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>'

// Graphite's mark from Simple Icons (CC0); its brand black is lost on a dark
// band, so it is filled grey
export const GRAPHITE_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa0a6" d="m15.215 0-12 3.215-3.215 12L8.785 24l12-3.215 3.215-12L15.215 0Zm1.958 20.966H6.827L1.655 12l5.172-8.966h10.346L22.345 12l-5.172 8.966Zm.68-14.823L9.86 4 4.006 9.858l2.14 8 7.995 2.141 5.853-5.857-2.14-8Z"/></svg>'

export const CIRCLES: Record<PrState, { glyph: string; color?: ThemeKey; dim?: true }> = {
  open: { glyph: '●', color: 'success' },
  draft: { glyph: '◯', color: 'inactive' },
  merged: { glyph: '✓', color: 'merged' },
  closed: { glyph: '✕', color: 'error' },
  none: { glyph: '◌', dim: true },
}
