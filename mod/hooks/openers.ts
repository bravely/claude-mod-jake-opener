import type { EngineInterface } from 'claude-code'

import type { PrRef, Snapshot } from '../types'
import { launchEditor } from './editor'
import { githubUrl, graphiteUrl } from './pr'

export type Target = { kind: 'url'; url: string } | { kind: 'directory'; path: string }

export type Opener = {
  id: string
  // used in toasts and accessibility, not drawn
  label: string
  scope: 'session' | 'pr'
  resolve(snapshot: Snapshot, pr?: PrRef): Target | undefined
}

export const OPENERS: Record<'worktreeEditor' | 'trunkEditor' | 'graphite' | 'github', Opener> = {
  worktreeEditor: {
    id: 'worktree-editor',
    label: 'Worktree editor',
    scope: 'session',
    resolve: s => ({ kind: 'directory', path: s.topLevel ?? s.cwd }),
  },
  trunkEditor: {
    id: 'trunk-editor',
    label: 'Trunk editor',
    scope: 'session',
    resolve: s => (s.topLevel !== null && s.trunkWorktree ? { kind: 'directory', path: s.trunkWorktree } : undefined),
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    scope: 'pr',
    resolve: (_, pr) => pr && { kind: 'url', url: graphiteUrl(pr) },
  },
  github: {
    id: 'github',
    label: 'GitHub',
    scope: 'pr',
    resolve: (_, pr) => pr && { kind: 'url', url: githubUrl(pr) },
  },
}

// A URL needs no call: it is drawn as a <Link>, which the desktop opens in the
// default browser. A directory opens in the editor.
export function openTarget($: EngineInterface, opener: Opener, target: Target): void {
  if (target.kind === 'directory') void launchEditor($, opener.label, target.path)
}
