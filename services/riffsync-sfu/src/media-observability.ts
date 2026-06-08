export type MediaLimitSignal = 'TransportLimitRejected' | 'ConsumerLimitRejected';

function riffsyncEnvironment(): string {
  return process.env.RIFFSYNC_ENVIRONMENT?.trim() || 'shared';
}

/** EMF counter via stdout (no PutMetricData IAM on SFU EC2). */
export function emitMediaLimitRejected(signal: MediaLimitSignal): void {
  const env = riffsyncEnvironment();
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Media',
            Dimensions: [['Environment', 'Signal']],
            Metrics: [{ Name: signal, Unit: 'Count' }],
          },
        ],
      },
      Environment: env,
      Signal: signal,
      [signal]: 1,
    }),
  );
}
