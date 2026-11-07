import type { Register } from 'claude-code'

import { renderBand } from './band'
import { decorateReply } from './decorate'
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
    startRefreshing($)

    return started
  })
  on('classic.SessionStart', refreshOnSessionStart)
  on('session.attach', refreshOnAttach)
  on('classic.FileChanged', refreshOnFileChange)
  on('turn.complete', refreshOnTurnComplete)
  on('session.receive', refreshOnGithubWake)
  on('tool.call', { tool: 'Bash' }, refreshAfterBash)

  on('ui.render', { component: 'AbovePrompt' }, renderBand)
  on('ui.render', { component: 'AssistantMessage' }, decorateReply)
}
