import type { Register } from 'claude-code'

import { decorateReply } from './decorate'

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, decorateReply)
}
