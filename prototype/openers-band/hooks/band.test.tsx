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
