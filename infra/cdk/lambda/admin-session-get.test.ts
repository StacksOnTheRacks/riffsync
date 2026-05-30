import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { handler } from './admin-session-get';
import { hasStaffRole, parseCognitoGroups } from './admin-session-shared';

function staffEvent(claims?: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /v1/admin/session',
    rawPath: '/v1/admin/session',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/v1/admin/session',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req',
      routeKey: 'GET /v1/admin/session',
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: claims ? { jwt: { claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('admin-session-shared', () => {
  describe('parseCognitoGroups', () => {
    it('parses array groups', () => {
      expect(parseCognitoGroups({ 'cognito:groups': ['admin', 'other'] })).toEqual(['admin', 'other']);
    });

    it('parses single string group', () => {
      expect(parseCognitoGroups({ 'cognito:groups': 'curator' })).toEqual(['curator']);
    });

    it('parses space-separated string groups', () => {
      expect(parseCognitoGroups({ 'cognito:groups': 'admin curator' })).toEqual(['admin', 'curator']);
    });

    it('parses comma-separated string groups from API Gateway', () => {
      expect(parseCognitoGroups({ 'cognito:groups': 'admin,curator' })).toEqual(['admin', 'curator']);
      expect(parseCognitoGroups({ 'cognito:groups': 'admin, curator' })).toEqual(['admin', 'curator']);
    });

    it('parses JSON array string groups from API Gateway', () => {
      expect(parseCognitoGroups({ 'cognito:groups': '["admin","curator"]' })).toEqual([
        'admin',
        'curator',
      ]);
    });

    it('returns empty when groups absent', () => {
      expect(parseCognitoGroups({})).toEqual([]);
      expect(parseCognitoGroups(undefined)).toEqual([]);
    });
  });

  describe('hasStaffRole', () => {
    it('accepts admin or curator', () => {
      expect(hasStaffRole(['admin'])).toBe(true);
      expect(hasStaffRole(['curator'])).toBe(true);
      expect(hasStaffRole(['viewer'])).toBe(false);
      expect(hasStaffRole([])).toBe(false);
    });
  });
});

describe('admin-session-get handler', () => {
  it('returns 200 for admin group', async () => {
    const res = await handler(
      staffEvent({ sub: 'staff-1', email: 'op@example.com', 'cognito:groups': ['admin'] }),
      {} as never,
      () => undefined,
    );
    expect(res?.statusCode).toBe(200);
    expect(JSON.parse(res?.body ?? '')).toEqual({
      sub: 'staff-1',
      email: 'op@example.com',
      groups: ['admin'],
    });
  });

  it('returns 200 for curator group only', async () => {
    const res = await handler(
      staffEvent({ sub: 'staff-2', 'cognito:groups': 'curator' }),
      {} as never,
      () => undefined,
    );
    expect(res?.statusCode).toBe(200);
    expect(JSON.parse(res?.body ?? '')).toMatchObject({
      sub: 'staff-2',
      email: null,
      groups: ['curator'],
    });
  });

  it('returns 200 when API Gateway passes comma-separated groups string', async () => {
    const res = await handler(
      staffEvent({ sub: 'staff-4', email: 'op@example.com', 'cognito:groups': 'admin,curator' }),
      {} as never,
      () => undefined,
    );
    expect(res?.statusCode).toBe(200);
    expect(JSON.parse(res?.body ?? '')).toEqual({
      sub: 'staff-4',
      email: 'op@example.com',
      groups: ['admin', 'curator'],
    });
  });

  it('returns 403 when sub present but groups missing staff role', async () => {
    const res = await handler(
      staffEvent({ sub: 'staff-3', 'cognito:groups': ['viewer'] }),
      {} as never,
      () => undefined,
    );
    expect(res?.statusCode).toBe(403);
    expect(JSON.parse(res?.body ?? '')).toEqual({
      error: 'Forbidden',
      code: 'staff_group_required',
    });
  });

  it('returns 401 when authorizer claims or sub absent', async () => {
    const noAuthorizer = staffEvent();
    (noAuthorizer.requestContext as { authorizer?: unknown }).authorizer = undefined;
    const res1 = await handler(noAuthorizer, {} as never, () => undefined);
    expect(res1?.statusCode).toBe(401);
    expect(JSON.parse(res1?.body ?? '')).toEqual({ error: 'Unauthorized', code: 'unauthorized' });

    const res2 = await handler(staffEvent({ 'cognito:groups': ['admin'] }), {} as never, () => undefined);
    expect(res2?.statusCode).toBe(401);
  });
});
