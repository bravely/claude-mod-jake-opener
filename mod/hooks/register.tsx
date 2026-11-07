import type { Register } from 'claude-code'

import { renderBand } from './band'
import { attachBandRuns, clearRunning } from './commands'
import { decorateReply } from './decorate'
import { PANE, notePaneClosed, renderPane, syncPaneOpen } from './pane'
import {
  refreshAfterBash,
  refreshOnAttach,
  refreshOnFileChange,
  refreshOnGithubWake,
  refreshOnSessionStart,
  refreshOnTurnComplete,
  startRefreshing,
} from './refresh'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await Promise.all([clearRunning($), syncPaneOpen($)])
    startRefreshing($)

    return started
  })
  on('classic.SessionStart', refreshOnSessionStart)
  on('session.attach', refreshOnAttach)
  on('classic.FileChanged', refreshOnFileChange)
  on('turn.complete', refreshOnTurnComplete)
  on('session.receive', refreshOnGithubWake)
  on('tool.call', { tool: 'Bash' }, refreshAfterBash)
  on('prompt.submit', attachBandRuns)

  on('ui.render', { component: 'AbovePrompt' }, renderBand)
  on('ui.render', { component: 'Pane', requestId: PANE }, renderPane)
  on('ui.close', { id: PANE }, notePaneClosed)
  on('ui.render', { component: 'AssistantMessage' }, decorateReply)
}
