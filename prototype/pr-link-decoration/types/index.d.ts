export type Variant = 'A' | 'B' | 'C' | 'D'

declare module 'claude-code' {
  interface PluginState {
    'pr-link-decoration-prototype': {
      variant: Variant
    }
  }
}
