import { expect, test } from 'claude-code/testing'

import { decorateText } from './decorate'
import { lines } from './shown'

const GH = 'https://github.com/bravely/demarest_mays/pull/302'
const GT = 'https://app.graphite.com/github/pr/bravely/demarest_mays/302'
const GT_LINK = `[⬡ Graphite](${GT})`

test('a markdown link to a PR keeps its label and gains a Graphite link', async () => {
  expect(decorateText(`See [the cookie fix](${GH}).`).text).toBe(
    `See [the cookie fix](${GH}) ${GT_LINK}.`,
  )
})

test('a bare or autolinked PR URL is relabelled repo#n first', async () => {
  expect(decorateText(`Opened ${GH}.`).text).toBe(`Opened [demarest_mays#302](${GH}) ${GT_LINK}.`)
  expect(decorateText(`Opened <${GH}>`).text).toBe(`Opened [demarest_mays#302](${GH}) ${GT_LINK}`)
  expect(decorateText(`(${GH})`).text).toBe(`([demarest_mays#302](${GH}) ${GT_LINK})`)
})

test('a path after the number stays on the link and not on the Graphite link', async () => {
  expect(decorateText(`${GH}/files`).text).toBe(`[demarest_mays#302](${GH}/files) ${GT_LINK}`)
})

test('code is left as written', async () => {
  const fenced = ['```sh', `gh pr view ${GH}`, '```'].join('\n')
  expect(decorateText(fenced)).toEqual({ text: fenced, prs: [] })
  expect(decorateText(`run \`gh pr view ${GH}\``)).toEqual({ text: `run \`gh pr view ${GH}\``, prs: [] })
})

test('a link still streaming in is left alone until it is complete', async () => {
  expect(decorateText(`See [the cookie fix](${GH}`).text).toBe(`See [the cookie fix](${GH}`)
  expect(decorateText(`See <${GH}`).text).toBe(`See <${GH}`)
  expect(decorateText(`See [the cookie fix](${GH})`).text).toBe(`See [the cookie fix](${GH}) ${GT_LINK}`)
})

test('links that are not PRs are not touched', async () => {
  const text = 'See https://github.com/bravely/demarest_mays/issues/302 and https://github.com/bravely/demarest_mays/pull/302x'
  expect(decorateText(text)).toEqual({ text, prs: [] })
})

const MESSAGE = { plugin: 'jake-opener', component: 'AssistantMessage' } as const

const REPLY = [
  `Stacked [the cookie fix](${GH}) on https://github.com/bravely/demarest_mays/pull/301.`,
  '',
  `Review the diff at ${GH}/files.`,
].join('\n')

test('a reply gets one strip of every PR it mentions, first mention first', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={'text' in e.props ? String(e.props.text) : ''} />
  })
  const ui = await $.ui.mount({ ...MESSAGE, surface: 'desktop', props: { text: REPLY, isFirstOfReply: true } })

  expect(lines(await ui.drawn())).toEqual([
    'Stacked the cookie fix ⬡ Graphite on demarest_mays#301 ⬡ Graphite.',
    '',
    'Review the diff at demarest_mays#302 ⬡ Graphite.',
    '[GitHub]#302[Graphite]↗ · [GitHub]#301[Graphite]↗',
  ])
  expect((await ui.findAll({ type: 'Link' })).map(l => l.props.href)).toEqual([
    GH,
    GT,
    'https://github.com/bravely/demarest_mays/pull/301',
    'https://app.graphite.com/github/pr/bravely/demarest_mays/301',
  ])
  await ui.unmount()
})

test('a reply with no PR link, a summary, or another surface is drawn as the engine draws it', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const cases = [
    { surface: 'desktop', props: { text: 'No links here.', isFirstOfReply: true } },
    { surface: 'desktop', props: { text: REPLY, isFirstOfReply: true, isSummary: true } },
    { surface: 'terminal', props: { text: REPLY, isFirstOfReply: true } },
  ] as const
  for (const c of cases) {
    const ui = await $.ui.mount({ ...MESSAGE, ...c })
    expect(lines(await ui.drawn())).toEqual(['engine'])
    await ui.unmount()
  }
})
