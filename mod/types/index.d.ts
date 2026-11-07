export type PrRef = { owner: string; repo: string; number: number }

export type PrState = 'open' | 'draft' | 'merged' | 'closed' | 'none'

// What one source (gh, ccd_pr or gt's cache) knows of a pull request.
export type KnownPr = { ref: PrRef; state: Exclude<PrState, 'none'>; title?: string }

export type GtBranch = { parent?: string; isTrunk: boolean; needsRestack: boolean }

export type PrCache = { byBranch: Record<string, KnownPr>; mtimeMs: number }

export type Rail = { pr?: KnownPr & { head?: string }; others: KnownPr[] }

export type GhPrs = {
  byBranch: Record<string, KnownPr>
  // titles of rail PRs, by GitHub URL, from `gh pr view`
  titles: Record<string, string>
  error?: string
}

export type Snapshot =
  | { cwd: string; topLevel: null }
  | {
      cwd: string
      topLevel: string
      // `HEAD` when detached
      branch: string
      commonDir: string
      gitDir: string
      head: string
      rebase?: string
      gtState: Record<string, GtBranch>
      gtInitialised: boolean
      gtInstalled: boolean
      trunk?: string
      trunkWorktree?: string
      prCache?: PrCache
      rail?: Rail
      ghPrs?: GhPrs
    }

export type RepoSnapshot = Extract<Snapshot, { topLevel: string }>

declare module 'claude-code' {
  interface PluginState {
    'jake-opener': {
      snapshot: Shaped<Snapshot | null>
      // fork branch → the child the ladder follows
      forkPicks: Record<string, string>
      reportedErrors: string | null
    }
  }
}
