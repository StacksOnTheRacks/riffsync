export type WsRealtimeRoute = 'chat' | 'chat_gif' | 'react';

export type WsRealtimeOutcome =
  | 'success'
  | 'validation_error'
  | 'auth_forbidden'
  | 'server_error';

export type ApiRoute =
  | 'GiphySearch'
  | 'FanAvatarUpload'
  | 'AdminCatalogPost'
  | 'AdminCatalogPatch'
  | 'AdminCatalogDelete';

export type GiphySearchOutcome =
  | 'success'
  | 'unauthorized'
  | 'validation_error'
  | 'rate_limited'
  | 'misconfigured'
  | 'upstream_error'
  | 'secret_unavailable';

export type FanAvatarUploadOutcome =
  | 'success'
  | 'unauthorized'
  | 'validation_error'
  | 'misconfigured'
  | 'server_error';

export type AdminCatalogPostOutcome =
  | 'success'
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'conflict'
  | 'server_error';

export type AdminCatalogPatchOutcome =
  | 'success'
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'not_found'
  | 'server_error';

export type AdminCatalogDeleteOutcome =
  | 'success'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'server_error';

export type ApiOutcome =
  | GiphySearchOutcome
  | FanAvatarUploadOutcome
  | AdminCatalogPostOutcome
  | AdminCatalogPatchOutcome
  | AdminCatalogDeleteOutcome;

const REALTIME_METRIC_NAME = 'Requests';
const API_METRIC_NAME = 'Requests';

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

/** EMF counter for HTTP API routes via stdout (no PutMetricData IAM required). */
export function emitApiEmf(route: ApiRoute, outcome: ApiOutcome): void {
  const env = riffsyncEnvironment();
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Api',
            Dimensions: [['Environment', 'Route', 'Outcome']],
            Metrics: [{ Name: API_METRIC_NAME, Unit: 'Count' }],
          },
        ],
      },
      Environment: env,
      Route: route,
      Outcome: outcome,
      [API_METRIC_NAME]: 1,
    }),
  );
}

export type ApiLogFields = {
  route: ApiRoute;
  outcome: ApiOutcome;
  queryLength?: number;
  resultCount?: number;
  fileSizeBytes?: number;
};

/** Content-safe structured INFO log for HTTP API handlers. */
export function logApiAction(fields: ApiLogFields): void {
  const payload: Record<string, unknown> = {
    riffsyncDiag: 'api',
    route: fields.route,
    outcome: fields.outcome,
  };
  if (fields.queryLength !== undefined) {
    payload.queryLength = fields.queryLength;
  }
  if (fields.resultCount !== undefined) {
    payload.resultCount = fields.resultCount;
  }
  if (fields.fileSizeBytes !== undefined) {
    payload.fileSizeBytes = fields.fileSizeBytes;
  }
  console.info(JSON.stringify(payload));
}

/** Structured error log without secrets or request bodies. */
export function logRiffsyncDiagError(diag: string, err: unknown): void {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : 'Error';
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : String(err);
  console.error(
    JSON.stringify({
      riffsyncDiag: diag,
      errorType: name,
      errorMessage: message.slice(0, 200),
    }),
  );
}

export function recordApiRoute(
  route: ApiRoute,
  outcome: ApiOutcome,
  extras?: Pick<ApiLogFields, 'queryLength' | 'resultCount' | 'fileSizeBytes'>,
): void {
  emitApiEmf(route, outcome);
  logApiAction({ route, outcome, ...extras });
}

export type AdminCatalogAuditFields = {
  route: 'AdminCatalogPost' | 'AdminCatalogPatch' | 'AdminCatalogDelete';
  action: 'create' | 'update' | 'delete';
  outcome:
    | AdminCatalogPostOutcome
    | AdminCatalogPatchOutcome
    | AdminCatalogDeleteOutcome;
  sub: string;
  episodeId: string;
  requestId: string;
  statusCode: number;
  validationFieldPaths?: string[];
};

/** Structured INFO audit log for admin catalog mutations (no request bodies). */
export function logAdminCatalogAudit(fields: AdminCatalogAuditFields): void {
  const payload: Record<string, unknown> = {
    riffsyncDiag: 'admin_catalog_audit',
    route: fields.route,
    action: fields.action,
    outcome: fields.outcome,
    sub: fields.sub,
    episodeId: fields.episodeId,
    requestId: fields.requestId,
    statusCode: fields.statusCode,
  };
  if (fields.validationFieldPaths !== undefined) {
    payload.validationFieldPaths = fields.validationFieldPaths;
  }
  console.info(JSON.stringify(payload));
}

export function recordAdminCatalogRoute(
  route: 'AdminCatalogPost' | 'AdminCatalogPatch' | 'AdminCatalogDelete',
  outcome: AdminCatalogPostOutcome | AdminCatalogPatchOutcome | AdminCatalogDeleteOutcome,
  audit: AdminCatalogAuditFields,
): void {
  emitApiEmf(route, outcome);
  logApiAction({ route, outcome });
  logAdminCatalogAudit(audit);
}

export function adminCatalogPostOutcomeFromStatus(statusCode: number): AdminCatalogPostOutcome {
  if (statusCode === 201) return 'success';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 400) return 'validation_error';
  if (statusCode === 409) return 'conflict';
  return 'server_error';
}

export function adminCatalogPatchOutcomeFromStatus(statusCode: number): AdminCatalogPatchOutcome {
  if (statusCode === 200) return 'success';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 400) return 'validation_error';
  if (statusCode === 404) return 'not_found';
  return 'server_error';
}

export function adminCatalogDeleteOutcomeFromStatus(statusCode: number): AdminCatalogDeleteOutcome {
  if (statusCode === 204) return 'success';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 409) return 'conflict';
  return 'server_error';
}
