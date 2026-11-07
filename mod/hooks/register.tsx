import type { Register } from 'claude-code'

import { renderBand } from './band'
import { decorateReply } from './decorate'

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, renderBand)
  on('ui.render', { component: 'AssistantMessage' }, decorateReply)
}
