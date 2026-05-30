import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitWsRealtimeEmf,
  logWsAction,
  recordWsRealtimeRoute,
  riffsyncEnvironment,
  wsRealtimeOutcomeFromStatus,
} from './riffsync-observability';

describe('riffsync-observability', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
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
});
