export type Case =
  | 'trunk'
  | 'untracked'
  | 'detached'
  | 'rebasing'
  | 'nogt'
  | 'norepo'
  | 'merged'
  | 'closed'
  | 'cachemiss'
  | 'nocache'
export type Look = 'A' | 'B'

declare module 'claude-code' {
  interface PluginState {
    'openers-band-edges': { case: Case; look: Look }
  }
}
