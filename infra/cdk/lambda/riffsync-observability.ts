export type WsRealtimeRoute = 'chat' | 'chat_gif' | 'react';

export type WsRealtimeOutcome =
  | 'success'
  | 'validation_error'
  | 'auth_forbidden'
  | 'server_error';

const REALTIME_METRIC_NAME = 'Requests';

export function wsRealtimeOutcomeFromStatus(statusCode: number): WsRealtimeOutcome {
  if (statusCode === 200) {
    return 'success';
  }
  if (statusCode === 400) {
    return 'validation_error';
  }
  if (statusCode === 403) {
    return 'auth_forbidden';
  }
  return 'server_error';
}

export function riffsyncEnvironment(): string {
  return process.env.RIFFSYNC_ENVIRONMENT?.trim() || 'unknown';
}

/** EMF counter via stdout (no PutMetricData IAM required). */
export function emitWsRealtimeEmf(route: WsRealtimeRoute, outcome: WsRealtimeOutcome): void {
  const env = riffsyncEnvironment();
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Realtime',
            Dimensions: [['Environment', 'Route', 'Outcome']],
            Metrics: [{ Name: REALTIME_METRIC_NAME, Unit: 'Count' }],
          },
        ],
      },
      Environment: env,
      Route: route,
      Outcome: outcome,
      [REALTIME_METRIC_NAME]: 1,
    }),
  );
}

export type WsRealtimeLogFields = {
  route: WsRealtimeRoute;
  outcome: WsRealtimeOutcome;
  connectionIdTail: string;
  roomIdHead: string;
  textLength?: number;
  hasGiphyId?: boolean;
};

/** Content-safe structured INFO log (no chat text, GIF URLs, or reaction payloads). */
export function logWsAction(fields: WsRealtimeLogFields): void {
  const payload: Record<string, unknown> = {
    riffsyncDiag: 'ws_realtime',
    route: fields.route,
    outcome: fields.outcome,
    connectionIdTail: fields.connectionIdTail,
    roomIdHead: fields.roomIdHead,
  };
  if (fields.textLength !== undefined) {
    payload.textLength = fields.textLength;
  }
  if (fields.hasGiphyId !== undefined) {
    payload.hasGiphyId = fields.hasGiphyId;
  }
  console.info(JSON.stringify(payload));
}

export function recordWsRealtimeRoute(
  route: WsRealtimeRoute,
  statusCode: number,
  connectionId: string,
  roomId: string,
  extras?: Pick<WsRealtimeLogFields, 'textLength' | 'hasGiphyId'>,
): void {
  const outcome = wsRealtimeOutcomeFromStatus(statusCode);
  emitWsRealtimeEmf(route, outcome);
  logWsAction({
    route,
    outcome,
    connectionIdTail: connectionId.slice(-12),
    roomIdHead: roomId.slice(0, 8),
    ...extras,
  });
}
