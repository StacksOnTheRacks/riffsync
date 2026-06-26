import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cognitoSend: vi.fn(),
  sesSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mocks.cognitoSend })),
  ListUsersCommand: vi.fn((input: unknown) => ({ input, kind: 'ListUsers' })),
}));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(() => ({ send: mocks.sesSend })),
  SendEmailCommand: vi.fn((input: unknown) => ({ input, kind: 'SendEmail' })),
}));

import { handler as audienceHandler } from './admin-email-audience';
import { handler as testHandler } from './admin-email-test';
import { handler as sendHandler } from './admin-email-send';
import {
  BROADCAST_CONFIRMATION_PHRASE,
  computeContentHash,
  createTestProof,
  renderEmailHtml,
  validateEmailContent,
} from './admin-email-shared';

function staffEvent(
  method: string,
  routeKey: string,
  path: string,
  claims?: Record<string, unknown>,
  body?: Record<string, unknown>,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    body: body ? JSON.stringify(body) : undefined,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-email-1',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: claims ? { jwt: { claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

const sampleContent = {
  version: 1 as const,
  blocks: [
    {
      type: 'paragraph' as const,
      children: [{ type: 'text' as const, text: 'Hello fans' }],
    },
  ],
};

const adminClaims = {
  sub: 'staff-admin-1',
  email: 'admin@example.com',
  'cognito:groups': ['admin'],
};

const curatorClaims = {
  sub: 'staff-curator-1',
  email: 'curator@example.com',
  'cognito:groups': ['curator'],
};

describe('admin-email-audience handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAN_USER_POOL_ID = 'fan-pool';
  });

  it('returns eligible count without exposing emails', async () => {
    mocks.cognitoSend.mockResolvedValueOnce({
      Users: [
        {
          Enabled: true,
          Attributes: [
            { Name: 'email', Value: 'fan1@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
        {
          Enabled: true,
          Attributes: [
            { Name: 'email', Value: 'bad' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
      ],
    });

    const res = await audienceHandler(
      staffEvent('GET', 'GET /v1/admin/email/audience', '/v1/admin/email/audience', adminClaims),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '');
    expect(body.eligibleCount).toBe(1);
    expect(body.emails).toBeUndefined();
  });

  it('rejects curator staff', async () => {
    const res = await audienceHandler(
      staffEvent('GET', 'GET /v1/admin/email/audience', '/v1/admin/email/audience', curatorClaims),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(403);
    expect(JSON.parse(res?.body ?? '').code).toBe('staff_group_required');
    expect(mocks.cognitoSend).not.toHaveBeenCalled();
  });
});

describe('admin-email-test handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL_TEST_PROOF_SECRET = 'test-secret';
    process.env.EMAIL_FROM_ADDRESS = 'RiffSync <noreply@riffsync.tv>';
    mocks.sesSend.mockResolvedValue({});
  });

  it('sends only to authenticated staff email', async () => {
    const res = await testHandler(
      staffEvent(
        'POST',
        'POST /v1/admin/email/test',
        '/v1/admin/email/test',
        adminClaims,
        { subject: 'Monthly update', content: sampleContent },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '');
    expect(body.ok).toBe(true);
    expect(body.recipient).toBe('admin@example.com');
    expect(body.contentHash).toBe(computeContentHash('Monthly update', sampleContent));
    expect(mocks.sesSend).toHaveBeenCalledTimes(1);
    const sendInput = mocks.sesSend.mock.calls[0][0].input;
    expect(sendInput.Destination.ToAddresses).toEqual(['admin@example.com']);
  });
});

describe('admin-email-send handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL_TEST_PROOF_SECRET = 'test-secret';
    process.env.EMAIL_FROM_ADDRESS = 'RiffSync <noreply@riffsync.tv>';
    process.env.ENABLE_ADMIN_CUSTOMER_EMAIL_SEND = 'true';
    process.env.FAN_USER_POOL_ID = 'fan-pool';
    mocks.sesSend.mockResolvedValue({});
  });

  it('refuses when kill switch disabled', async () => {
    process.env.ENABLE_ADMIN_CUSTOMER_EMAIL_SEND = 'false';

    const res = await sendHandler(
      staffEvent(
        'POST',
        'POST /v1/admin/email/send',
        '/v1/admin/email/send',
        adminClaims,
        {
          subject: 'Monthly update',
          content: sampleContent,
          confirmationPhrase: BROADCAST_CONFIRMATION_PHRASE,
          contentHash: computeContentHash('Monthly update', sampleContent),
          audienceCount: 1,
          testSentAt: new Date().toISOString(),
          testProof: 'deadbeef',
        },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(403);
    expect(JSON.parse(res?.body ?? '').code).toBe('customer_email_send_disabled');
  });

  it('refuses without confirmation phrase', async () => {
    const res = await sendHandler(
      staffEvent(
        'POST',
        'POST /v1/admin/email/send',
        '/v1/admin/email/send',
        adminClaims,
        {
          subject: 'Monthly update',
          content: sampleContent,
          confirmationPhrase: 'wrong',
          contentHash: computeContentHash('Monthly update', sampleContent),
          audienceCount: 1,
          testSentAt: new Date().toISOString(),
          testProof: 'deadbeef',
        },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(400);
    expect(JSON.parse(res?.body ?? '').code).toBe('confirmation_required');
  });

  it('refuses curator staff', async () => {
    const res = await sendHandler(
      staffEvent(
        'POST',
        'POST /v1/admin/email/send',
        '/v1/admin/email/send',
        curatorClaims,
        {
          subject: 'Monthly update',
          content: sampleContent,
          confirmationPhrase: BROADCAST_CONFIRMATION_PHRASE,
          contentHash: computeContentHash('Monthly update', sampleContent),
          audienceCount: 1,
          testSentAt: new Date().toISOString(),
          testProof: 'deadbeef',
        },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(403);
    expect(JSON.parse(res?.body ?? '').code).toBe('staff_group_required');
  });

  it('refuses without valid test proof', async () => {
    mocks.cognitoSend.mockResolvedValueOnce({
      Users: [
        {
          Enabled: true,
          Attributes: [
            { Name: 'email', Value: 'fan1@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
      ],
    });

    const res = await sendHandler(
      staffEvent(
        'POST',
        'POST /v1/admin/email/send',
        '/v1/admin/email/send',
        adminClaims,
        {
          subject: 'Monthly update',
          content: sampleContent,
          confirmationPhrase: BROADCAST_CONFIRMATION_PHRASE,
          contentHash: computeContentHash('Monthly update', sampleContent),
          audienceCount: 1,
          testSentAt: new Date().toISOString(),
          testProof: 'invalid-proof',
        },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(409);
    expect(JSON.parse(res?.body ?? '').code).toBe('test_required');
  });

  it('broadcasts to eligible fan recipients after valid test proof', async () => {
    const contentHash = computeContentHash('Monthly update', sampleContent);
    const testSentAt = new Date().toISOString();
    const testProof = createTestProof('staff-admin-1', contentHash, testSentAt, 'test-secret');

    mocks.cognitoSend.mockResolvedValueOnce({
      Users: [
        {
          Enabled: true,
          Attributes: [
            { Name: 'email', Value: 'fan1@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
        {
          Enabled: false,
          Attributes: [
            { Name: 'email', Value: 'disabled@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
      ],
    });

    const res = await sendHandler(
      staffEvent(
        'POST',
        'POST /v1/admin/email/send',
        '/v1/admin/email/send',
        adminClaims,
        {
          subject: 'Monthly update',
          content: sampleContent,
          confirmationPhrase: BROADCAST_CONFIRMATION_PHRASE,
          contentHash,
          audienceCount: 1,
          testSentAt,
          testProof,
        },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '');
    expect(body.sentCount).toBe(1);
    expect(mocks.sesSend).toHaveBeenCalledTimes(1);
  });
});

describe('admin-email renderer', () => {
  it('strips unsafe link schemes', () => {
    expect(
      validateEmailContent({
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            children: [{ type: 'link', text: 'bad', href: 'javascript:alert(1)' }],
          },
        ],
      }),
    ).toBeNull();
  });

  it('renders branded html shell', () => {
    const html = renderEmailHtml('Hello', sampleContent);
    expect(html).toContain('RiffSync');
    expect(html).toContain('Hello fans');
    expect(html).not.toContain('<script');
  });
});
