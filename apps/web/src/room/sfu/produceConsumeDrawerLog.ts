import { emitClientDrawerLog } from '../clientDrawerLog'
import type { SfuMediaErrorCode } from './mediasoupSharing'

export function emitProducerClosedDrawerLog(): void {
  emitClientDrawerLog({
    drawer: 'produce_consume',
    event: 'producer_closed',
    code: 'PRODUCER_CLOSED',
    outcome: 'failed',
    severity: 'info',
  })
}

export function emitPartialUnpublishDrawerLog(): void {
  emitClientDrawerLog({
    drawer: 'produce_consume',
    event: 'partial_unpublish',
    outcome: 'retry',
    severity: 'info',
  })
}

export function emitConsumerAttachFailedDrawerLog(code?: string): void {
  emitClientDrawerLog({
    drawer: 'produce_consume',
    event: 'consumer_attach_failed',
    outcome: 'failed',
    ...(code ? { code } : {}),
  })
}

export function emitTransportLimitDrawerLog(): void {
  emitClientDrawerLog({
    drawer: 'produce_consume',
    event: 'transport_limit',
    code: 'TRANSPORT_LIMIT_REACHED',
    outcome: 'failed',
  })
}

export function emitConsumerLimitDrawerLog(): void {
  emitClientDrawerLog({
    drawer: 'produce_consume',
    event: 'consumer_limit',
    code: 'CONSUMER_LIMIT_REACHED',
    outcome: 'failed',
  })
}

export function emitMixErrorDrawerLog(code: string): void {
  emitClientDrawerLog({
    drawer: 'produce_consume',
    event: 'mix_error',
    code,
    outcome: 'failed',
  })
}

/** Classify SFU media errors into produce/consume drawer logs (caps and attach failures). */
export function emitProduceConsumeMediaErrorLog(code: SfuMediaErrorCode, message: string): void {
  const lower = message.toLowerCase()
  if (lower.includes('transport limit reached')) {
    emitTransportLimitDrawerLog()
    return
  }
  if (lower.includes('consumer limit reached')) {
    emitConsumerLimitDrawerLog()
    return
  }
  if (code !== 'consume_failed') return
  if (lower.includes('gone') || lower.includes('host stream ended')) return
  emitConsumerAttachFailedDrawerLog()
}
