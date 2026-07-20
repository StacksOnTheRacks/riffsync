function riffsyncEnvironment() {
    return process.env.RIFFSYNC_ENVIRONMENT?.trim() || 'shared';
}
function emitEmfCounter(name, dimensions) {
    const env = riffsyncEnvironment();
    const dimensionNames = Object.keys(dimensions);
    console.log(JSON.stringify({
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
    }));
}
/** EMF counter via stdout (no PutMetricData IAM on SFU EC2). */
export function emitMediaLimitRejected(signal) {
    emitEmfCounter(signal, { Signal: signal });
}
export function emitProduceFailure(reason) {
    emitEmfCounter('ProduceFailure', { Reason: reason });
}
export function emitIceTransportSignal(signal) {
    emitEmfCounter('IceTransportSignal', { Signal: signal });
}
export function emitProducerGauge(roomKey, count) {
    const env = riffsyncEnvironment();
    console.log(JSON.stringify({
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
    }));
}
export function emitConsumerGauge(roomKey, count) {
    const env = riffsyncEnvironment();
    console.log(JSON.stringify({
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
    }));
}
