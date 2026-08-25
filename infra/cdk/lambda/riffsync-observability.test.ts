import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitApiEmf,
  emitPresenceActiveFanOut,
  emitPresenceRequestRehydrated,
  emitProductEmf,
  emitQualifyingActiveWrite,
  emitTypingRouteAccepted,
  emitTypingRouteThrottled,
  emitWsRealtimeEmf,
  logAdminCatalogAudit,
  logApiAction,
  logRiffsyncDiagError,
  logWsAction,
  recordAdminCatalogRoute,
  recordApiRoute,
  recordWsRealtimeRoute,
  riffsyncEnvironment,
  wsRealtimeOutcomeFromStatus,
} from './riffsync-observability';

const FORBIDDEN_EMF_PROPERTY_KEYS = ['roomId', 'sessionId', 'sub', 'fanSub', 'hostSub', 'connectionId', 'slug'] as const;
const FORBIDDEN_EMF_DIMENSIONS = ['roomId', 'sessionId', 'sub', 'fanSub', 'hostSub', 'connectionId', 'slug'] as const;

function parseEmfLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

function assertLowCardinalityEmf(parsed: Record<string, unknown>): void {
  for (const key of FORBIDDEN_EMF_PROPERTY_KEYS) {
    expect(parsed[key]).toBeUndefined();
  }
  const aws = parsed._aws as {
    CloudWatchMetrics: Array<{ Dimensions: string[][] }>;
  };
  for (const group of aws.CloudWatchMetrics[0].Dimensions) {
    for (const dim of group) {
      expect(FORBIDDEN_EMF_DIMENSIONS).not.toContain(dim);
    }
  }
}

describe('riffsync-observability', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.RIFFSYNC_ENVIRONMENT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps HTTP status codes to outcomes', () => {
    expect(wsRealtimeOutcomeFromStatus(200)).toBe('success');
    expect(wsRealtimeOutcomeFromStatus(400)).toBe('validation_error');
    expect(wsRealtimeOutcomeFromStatus(403)).toBe('auth_forbidden');
    expect(wsRealtimeOutcomeFromStatus(500)).toBe('server_error');
    expect(wsRealtimeOutcomeFromStatus(410)).toBe('server_error');
  });

  it('uses RIFFSYNC_ENVIRONMENT when set', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'prod';
    expect(riffsyncEnvironment()).toBe('prod');
  });

  it('emits EMF with RiffSync/Realtime namespace and dimensions', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'dev';
    emitWsRealtimeEmf('chat', 'success');

    expect(console.log).toHaveBeenCalledTimes(1);
    const line = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const aws = parsed._aws as {
      CloudWatchMetrics: Array<{
        Namespace: string;
        Dimensions: string[][];
        Metrics: Array<{ Name: string; Unit: string }>;
      }>;
    };

    expect(aws.CloudWatchMetrics[0].Namespace).toBe('RiffSync/Realtime');
    expect(aws.CloudWatchMetrics[0].Dimensions).toEqual([['Environment', 'Route', 'Outcome']]);
    expect(aws.CloudWatchMetrics[0].Metrics).toEqual([{ Name: 'Requests', Unit: 'Count' }]);
    expect(parsed.Environment).toBe('dev');
    expect(parsed.Route).toBe('chat');
    expect(parsed.Outcome).toBe('success');
    expect(parsed.Requests).toBe(1);
  });

  it('logs safe fields without message content', () => {
    logWsAction({
      route: 'chat_gif',
      outcome: 'validation_error',
      connectionIdTail: 'conn-tail-12',
      roomIdHead: 'room-abc',
      hasGiphyId: false,
    });

    expect(console.info).toHaveBeenCalledTimes(1);
    const line = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      riffsyncDiag: 'ws_realtime',
      route: 'chat_gif',
      outcome: 'validation_error',
      connectionIdTail: 'conn-tail-12',
      roomIdHead: 'room-abc',
      hasGiphyId: false,
    });
    expect(parsed.text).toBeUndefined();
    expect(parsed.renditionUrl).toBeUndefined();
    expect(parsed.emoji).toBeUndefined();
  });

  it('recordWsRealtimeRoute emits EMF and log together', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'staging';
    recordWsRealtimeRoute('react', 200, 'abcdefghijklmnop', 'room-xyz-1', {});

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
    const emf = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(emf.Route).toBe('react');
    expect(emf.Outcome).toBe('success');

    const logLine = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(logLine.connectionIdTail).toBe('efghijklmnop');
    expect(logLine.roomIdHead).toBe('room-xyz');
  });

  it('emits API EMF with RiffSync/Api namespace and dimensions', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'prod';
    emitApiEmf('GiphySearch', 'success');

    expect(console.log).toHaveBeenCalledTimes(1);
    const line = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const aws = parsed._aws as {
      CloudWatchMetrics: Array<{
        Namespace: string;
        Dimensions: string[][];
        Metrics: Array<{ Name: string; Unit: string }>;
      }>;
    };

    expect(aws.CloudWatchMetrics[0].Namespace).toBe('RiffSync/Api');
    expect(aws.CloudWatchMetrics[0].Dimensions).toEqual([['Environment', 'Route', 'Outcome']]);
    expect(parsed.Environment).toBe('prod');
    expect(parsed.Route).toBe('GiphySearch');
    expect(parsed.Outcome).toBe('success');
    expect(parsed.Requests).toBe(1);
  });

  it('logs API actions without query text or avatar URLs', () => {
    logApiAction({
      route: 'GiphySearch',
      outcome: 'success',
      queryLength: 4,
      resultCount: 2,
    });

    expect(console.info).toHaveBeenCalledTimes(1);
    const line = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      riffsyncDiag: 'api',
      route: 'GiphySearch',
      outcome: 'success',
      queryLength: 4,
      resultCount: 2,
    });
    expect(parsed.q).toBeUndefined();
    expect(parsed.avatarUrl).toBeUndefined();
  });

  it('recordApiRoute emits EMF and log together', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'staging';
    recordApiRoute('FanAvatarUpload', 'validation_error', { fileSizeBytes: 1024 });

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
    const emf = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(emf.Route).toBe('FanAvatarUpload');
    expect(emf.Outcome).toBe('validation_error');
  });

  it('logRiffsyncDiagError emits structured JSON without raw Error dumps', () => {
    logRiffsyncDiagError('giphy_secret_read_failed', new Error('AccessDenied'));

    expect(console.error).toHaveBeenCalledTimes(1);
    const line = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      riffsyncDiag: 'giphy_secret_read_failed',
      errorType: 'Error',
      errorMessage: 'AccessDenied',
    });
  });

  it('emits AdminCatalogPost EMF without sub or episodeId dimensions', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'prod';
    emitApiEmf('AdminCatalogPost', 'success');

    expect(console.log).toHaveBeenCalledTimes(1);
    const line = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.Route).toBe('AdminCatalogPost');
    expect(parsed.Outcome).toBe('success');
    expect(parsed.sub).toBeUndefined();
    expect(parsed.episodeId).toBeUndefined();
  });

  it('logs admin catalog audit with operator and episode metadata', () => {
    logAdminCatalogAudit({
      route: 'AdminCatalogPost',
      action: 'create',
      outcome: 'success',
      sub: 'staff-sub-1',
      episodeId: 'tw-smoke',
      requestId: 'req-abc',
      statusCode: 201,
    });

    expect(console.info).toHaveBeenCalledTimes(1);
    const line = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      riffsyncDiag: 'admin_catalog_audit',
      route: 'AdminCatalogPost',
      action: 'create',
      sub: 'staff-sub-1',
      episodeId: 'tw-smoke',
      requestId: 'req-abc',
      statusCode: 201,
    });
  });

  it('recordAdminCatalogRoute emits EMF and audit together', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'prod';
    recordAdminCatalogRoute('AdminCatalogPatch', 'validation_error', {
      route: 'AdminCatalogPatch',
      action: 'update',
      outcome: 'validation_error',
      sub: 'staff-sub-2',
      episodeId: 'ep-1',
      requestId: 'req-patch',
      statusCode: 400,
      validationFieldPaths: ['/title'],
    });

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(2);
  });

  it('emits typing route EMF without high-cardinality dimensions', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'dev';
    emitTypingRouteAccepted('typing_start');
    emitTypingRouteThrottled('typing_stop');

    expect(console.log).toHaveBeenCalledTimes(2);
    for (const call of (console.log as ReturnType<typeof vi.fn>).mock.calls) {
      const parsed = parseEmfLine(call[0] as string);
      assertLowCardinalityEmf(parsed);
    }
    const accepted = parseEmfLine((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(accepted.TypingRouteAccepted).toBe(1);
    expect(accepted.Route).toBe('typing_start');
    const throttled = parseEmfLine((console.log as ReturnType<typeof vi.fn>).mock.calls[1][0] as string);
    expect(throttled.TypingRouteThrottled).toBe(1);
    expect(throttled.Route).toBe('typing_stop');
  });

  it('emits Product EMF with RiffSync/Product namespace and dimensions', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'prod';
    emitProductEmf('RoomCreate', 'success');

    expect(console.log).toHaveBeenCalledTimes(1);
    const line = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const aws = parsed._aws as {
      CloudWatchMetrics: Array<{
        Namespace: string;
        Dimensions: string[][];
        Metrics: Array<{ Name: string; Unit: string }>;
      }>;
    };

    expect(aws.CloudWatchMetrics[0].Namespace).toBe('RiffSync/Product');
    expect(aws.CloudWatchMetrics[0].Dimensions).toEqual([['Environment', 'Route', 'Outcome']]);
    expect(aws.CloudWatchMetrics[0].Metrics).toEqual([{ Name: 'Requests', Unit: 'Count' }]);
    expect(parsed.Environment).toBe('prod');
    expect(parsed.Route).toBe('RoomCreate');
    expect(parsed.Outcome).toBe('success');
    expect(parsed.Requests).toBe(1);
  });

  it('emits Product EMF for all routes without high-cardinality keys', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'staging';
    const routes = ['GuestRoomJoin', 'BroadcastStarted', 'RoomCreate', 'LiveChannelView'] as const;
    for (const route of routes) {
      emitProductEmf(route, 'success');
    }

    expect(console.log).toHaveBeenCalledTimes(4);
    for (const call of (console.log as ReturnType<typeof vi.fn>).mock.calls) {
      const parsed = parseEmfLine(call[0] as string);
      assertLowCardinalityEmf(parsed);
      const aws = parsed._aws as {
        CloudWatchMetrics: Array<{ Namespace: string }>;
      };
      expect(aws.CloudWatchMetrics[0].Namespace).toBe('RiffSync/Product');
      expect(parsed.Outcome).toBe('success');
      expect(parsed.Requests).toBe(1);
    }
  });

  it('emits presence and qualifying active EMF without high-cardinality dimensions', () => {
    process.env.RIFFSYNC_ENVIRONMENT = 'staging';
    emitQualifyingActiveWrite('chat');
    emitPresenceActiveFanOut();
    emitPresenceRequestRehydrated();

    expect(console.log).toHaveBeenCalledTimes(3);
    for (const call of (console.log as ReturnType<typeof vi.fn>).mock.calls) {
      assertLowCardinalityEmf(parseEmfLine(call[0] as string));
    }
    const qualifying = parseEmfLine((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(qualifying.QualifyingActiveWrite).toBe(1);
    expect(qualifying.Route).toBe('chat');
    const fanOut = parseEmfLine((console.log as ReturnType<typeof vi.fn>).mock.calls[1][0] as string);
    expect(fanOut.PresenceActiveFanOut).toBe(1);
    expect(fanOut.Route).toBeUndefined();
    const rehydrated = parseEmfLine((console.log as ReturnType<typeof vi.fn>).mock.calls[2][0] as string);
    expect(rehydrated.PresenceRequestRehydrated).toBe(1);
  });
});
