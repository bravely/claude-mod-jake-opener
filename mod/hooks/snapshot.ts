import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Snapshot } from '../types'

// Change the tag when Snapshot's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshotState = atom({ plugin: 'jake-opener', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})

export function readSnapshot($: EngineInterface): Promise<Snapshot | null> {
  return read($, snapshotState)
}
