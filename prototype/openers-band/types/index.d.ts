export type Variant = 'A' | 'B' | 'C' | 'D'
export type Fixture = 'big' | 'small' | 'forked' | 'none' | 'nopr'
export type ForkRule = 'path' | 'all'

declare module 'claude-code' {
  interface PluginState {
    'openers-band-prototype': {
      variant: Variant
      fixture: Fixture
      forkRule: ForkRule
    }
  }
}
