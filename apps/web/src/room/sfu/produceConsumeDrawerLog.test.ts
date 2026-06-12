import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientDrawerLog from '../clientDrawerLog'
import {
  emitConsumerAttachFailedDrawerLog,
  emitConsumerLimitDrawerLog,
  emitProduceConsumeMediaErrorLog,
  emitProducerClosedDrawerLog,
  emitTransportLimitDrawerLog,
} from './produceConsumeDrawerLog'

vi.mock('../clientDrawerLog', () => ({
  emitClientDrawerLog: vi.fn(),
}))

describe('produceConsumeDrawerLog', () => {
  beforeEach(() => {
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits producer_closed at INFO with PRODUCER_CLOSED', () => {
    emitProducerClosedDrawerLog()
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'producer_closed',
      code: 'PRODUCER_CLOSED',
      outcome: 'failed',
      severity: 'info',
    })
  })

  it('maps transport limit messages to transport_limit', () => {
    emitProduceConsumeMediaErrorLog('produce_failed', 'transport limit reached')
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'transport_limit',
      code: 'TRANSPORT_LIMIT_REACHED',
      outcome: 'failed',
    })
  })

  it('maps consumer limit messages to consumer_limit', () => {
    emitProduceConsumeMediaErrorLog('consume_failed', 'consumer limit reached')
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'consumer_limit',
      code: 'CONSUMER_LIMIT_REACHED',
      outcome: 'failed',
    })
  })

  it('maps other consume failures to consumer_attach_failed', () => {
    emitProduceConsumeMediaErrorLog('consume_failed', 'consume failed on device')
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'consumer_attach_failed',
      outcome: 'failed',
    })
  })

  it('skips benign host stream ended consume failures', () => {
    emitProduceConsumeMediaErrorLog('consume_failed', 'Host stream ended; waiting for share.')
    expect(clientDrawerLog.emitClientDrawerLog).not.toHaveBeenCalled()
  })

  it('emits typed codes on direct limit helpers', () => {
    emitTransportLimitDrawerLog()
    emitConsumerLimitDrawerLog()
    emitConsumerAttachFailedDrawerLog('CONSUMER_LIMIT_REACHED')

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'transport_limit', code: 'TRANSPORT_LIMIT_REACHED' }),
    )
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'consumer_limit', code: 'CONSUMER_LIMIT_REACHED' }),
    )
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'consumer_attach_failed', code: 'CONSUMER_LIMIT_REACHED' }),
    )
  })
})
