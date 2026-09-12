import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './cast-diag';

function httpEvent(input: {
  method: string;
  body?: string;
  query?: Record<string, string>;
}): Parameters<typeof handler>[0] {
  return {
    version: '2.0',
    rawPath: '/v1/cast/diag',
    rawQueryString: '',
    headers: {},
    queryStringParameters: input.query,
    requestContext: {
      http: { method: input.method, path: '/v1/cast/diag' },
    },
    body: input.body,
    isBase64Encoded: false,
  } as Parameters<typeof handler>[0];
}

describe('cast-diag handler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    process.env.RIFFSYNC_ENVIRONMENT = 'prod';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RIFFSYNC_ENVIRONMENT;
  });

  it('records an allowlisted POST event and strips unknown fields', async () => {
    const result = await handler(
      httpEvent({
        method: 'POST',
        body: JSON.stringify({
          event: 'sender_request_session_rejected',
          hop: 'sender',
          attemptId: '11111111-1111-4111-8111-111111111111',
          code: 'session_error',
          description: 'LAUNCH_ERROR',
          details: 'LOAD_CANCELLED',
          roomId: 'room-should-drop',
          deviceName: 'Living Room TV',
        }),
      }),
    );

    expect(result).toMatchObject({ statusCode: 204 });
    const infoLine = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(infoLine) as Record<string, unknown>;
    expect(parsed).toEqual({
      riffsyncDiag: 'cast',
      event: 'sender_request_session_rejected',
      hop: 'sender',
      attemptId: '11111111-1111-4111-8111-111111111111',
      code: 'session_error',
      description: 'LAUNCH_ERROR',
      details: 'LOAD_CANCELLED',
    });
    expect(parsed.roomId).toBeUndefined();
    expect(parsed.deviceName).toBeUndefined();

    const emf = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string) as {
      Event: string;
      Hop: string;
    };
    expect(emf.Event).toBe('sender_request_session_rejected');
    expect(emf.Hop).toBe('sender');
  });

  it('strips control characters from description and details', async () => {
    const result = await handler(
      httpEvent({
        method: 'POST',
        body: JSON.stringify({
          event: 'sender_start_failed',
          hop: 'sender',
          description: `LAUNCH${String.fromCharCode(0, 31, 127)}ERROR`,
          details: `LOAD${String.fromCharCode(9)}CANCELLED`,
        }),
      }),
    );

    expect(result).toMatchObject({ statusCode: 204 });
    const infoLine = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(JSON.parse(infoLine)).toMatchObject({
      riffsyncDiag: 'cast',
      event: 'sender_start_failed',
      description: 'LAUNCHERROR',
      details: 'LOADCANCELLED',
    });
  });

  it('rejects unknown events and oversized bodies', async () => {
    const unknown = await handler(
      httpEvent({ method: 'POST', body: JSON.stringify({ event: 'not_a_real_event' }) }),
    );
    expect(unknown).toMatchObject({ statusCode: 400 });

    const huge = await handler(httpEvent({ method: 'POST', body: 'x'.repeat(2000) }));
    expect(huge).toMatchObject({ statusCode: 413 });
    expect(console.info).not.toHaveBeenCalled();
  });

  it('records a receiver pixel GET and still returns a gif', async () => {
    const result = (await handler(
      httpEvent({ method: 'GET', query: { e: 'receiver_html_parsed' } }),
    )) as { statusCode: number; headers?: Record<string, string>; isBase64Encoded?: boolean };

    expect(result.statusCode).toBe(200);
    expect(result.headers?.['content-type']).toBe('image/gif');
    expect(result.isBase64Encoded).toBe(true);
    const infoLine = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(JSON.parse(infoLine)).toMatchObject({
      riffsyncDiag: 'cast',
      event: 'receiver_html_parsed',
      hop: 'receiver',
    });
  });

  it('does not record a pixel GET with an unknown event', async () => {
    const result = await handler(httpEvent({ method: 'GET', query: { e: 'nope' } }));
    expect(result).toMatchObject({ statusCode: 200 });
    expect(console.info).not.toHaveBeenCalled();
  });
});
