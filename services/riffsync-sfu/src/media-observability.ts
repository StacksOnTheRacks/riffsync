export type MediaLimitSignal = 'TransportLimitRejected' | 'ConsumerLimitRejected';

export type ProduceFailureReason =
  | 'producer_class_mismatch'
  | 'session_producer_limit'
  | 'room_producer_limit'
  | 'bad_params'
  | 'forbidden';

export type IceTransportSignal =
  | 'IceConnected'
  | 'IceFailed'
  | 'IceDisconnected'
  | 'IceRelayUsed';

function riffsyncEnvironment(): string {
  return process.env.RIFFSYNC_ENVIRONMENT?.trim() || 'shared';
}

function emitEmfCounter(name: string, dimensions: Record<string, string>): void {
  const env = riffsyncEnvironment();
  const dimensionNames = Object.keys(dimensions);
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Media',
            Dimensions: [['Environment', ...dimensionNames]],
            Metrics: [{ Name: name, Unit: 'Count' }],
          },
        ],
      },
      Environment: env,
      ...dimensions,
      [name]: 1,
    }),
  );
}

/** EMF counter via stdout (no PutMetricData IAM on SFU EC2). */
export function emitMediaLimitRejected(signal: MediaLimitSignal): void {
  emitEmfCounter(signal, { Signal: signal });
}

export function emitProduceFailure(reason: ProduceFailureReason): void {
  emitEmfCounter('ProduceFailure', { Reason: reason });
}

export function emitIceTransportSignal(signal: IceTransportSignal): void {
  emitEmfCounter('IceTransportSignal', { Signal: signal });
}

export function emitProducerGauge(roomKey: string, count: number): void {
  const env = riffsyncEnvironment();
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Media',
            Dimensions: [['Environment']],
            Metrics: [{ Name: 'ActiveProducers', Unit: 'Count' }],
          },
        ],
      },
      Environment: env,
      roomKey,
      ActiveProducers: count,
    }),
  );
}

export function emitConsumerGauge(roomKey: string, count: number): void {
  const env = riffsyncEnvironment();
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Media',
            Dimensions: [['Environment']],
            Metrics: [{ Name: 'ActiveConsumers', Unit: 'Count' }],
          },
        ],
      },
      Environment: env,
      roomKey,
      ActiveConsumers: count,
    }),
  );
}
