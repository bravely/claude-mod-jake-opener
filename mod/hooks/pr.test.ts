import { expect, test } from 'claude-code/testing'

import { githubUrl, graphiteUrl, parsePrUrl, prFromRepo } from './pr'

const PR = { owner: 'bravely', repo: 'demarest_mays', number: 302 }

test('a GitHub PR URL parses, with or without a path after the number', async () => {
  expect(parsePrUrl('https://github.com/bravely/demarest_mays/pull/302')).toEqual(PR)
  expect(parsePrUrl('https://github.com/bravely/demarest_mays/pull/302/files')).toEqual(PR)
  expect(parsePrUrl('https://github.com/bravely/demarest_mays/pull/302#discussion_r1')).toEqual(PR)
})

test("gt's Graphite link parses to the same PR", async () => {
  expect(parsePrUrl('https://app.graphite.com/github/pr/bravely/demarest_mays/302')).toEqual(PR)
})

test('URLs that are not a PR do not parse', async () => {
  expect(parsePrUrl('https://github.com/bravely/demarest_mays/issues/302')).toBeUndefined()
  expect(parsePrUrl('https://github.com/bravely/demarest_mays/pull/')).toBeUndefined()
  expect(parsePrUrl('https://gitlab.com/bravely/demarest_mays/pull/302')).toBeUndefined()
  expect(parsePrUrl('https://github.com/bravely/demarest_mays/pull/302x')).toBeUndefined()
})

test('both links are built from owner, repo and number', async () => {
  expect(githubUrl(PR)).toBe('https://github.com/bravely/demarest_mays/pull/302')
  expect(graphiteUrl(PR)).toBe('https://app.graphite.com/github/pr/bravely/demarest_mays/302')
})

test("ccd_pr's repo and number name a PR", async () => {
  expect(prFromRepo('bravely/demarest_mays', 302)).toEqual(PR)
  expect(prFromRepo('demarest_mays', 302)).toBeUndefined()
})
