import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'openers-band-prototype',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20 },
} as const

test('every variant draws every fixture on desktop', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  for (let v = 0; v < 4; v++) {
    for (let d = 0; d < 5; d++) {
      expect(await ui.find({ key: 'editor' })).toBeDefined()
      expect(await ui.find({ key: 'variant' })).toBeDefined()
      await ui.press({ key: 'fixture' })
    }
    await ui.press({ key: 'fork' })
    await ui.press({ key: 'variant' })
  }
  expect((await ui.find({ key: 'variant' }))?.text).toMatch(/^A: Chip row/)
  await ui.unmount()
})

test('the ladder steps through the branches at each fork', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await ui.press({ key: 'variant' })
  await ui.press({ key: 'variant' }) // C: Ladder
  await ui.press({ key: 'fixture' })
  await ui.press({ key: 'fixture' }) // Forked Stack
  await ui.press({ key: 'fork' }) // every branch
  expect((await ui.find({ key: 'fork-c' }))?.text).toMatch(/^\[⑂ 1\/2\]/)
  expect((await ui.find({ key: 'fork-d' }))?.text).toMatch(/^\[⑂ 1\/2\]/)
  await ui.press({ key: 'fork-c', link: { href: 'https://fork.invalid/c' } })
  expect((await ui.find({ key: 'fork-c' }))?.text).toMatch(/^\[⑂ 2\/2\]/)
  expect(await ui.find({ key: 'fork-d' })).toBeUndefined() // #304's branch has no fork
  await ui.unmount()
})
