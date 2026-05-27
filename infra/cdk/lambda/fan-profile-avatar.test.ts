import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import {
  FAN_AVATAR_MAX_BYTES,
  parseMultipartSingleFile,
  publicAvatarUrl,
  sniffImageMime,
  validateAvatarBytes,
} from './fan-profile-avatar';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function buildMultipartBody(
  boundary: string,
  fieldName: string,
  filename: string,
  contentType: string,
  data: Buffer,
): Buffer {
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([preamble, data, closing]);
}

describe('fan-profile-avatar', () => {
  describe('sniffImageMime', () => {
    it('accepts png magic bytes', () => {
      expect(sniffImageMime(PNG_1X1)).toBe('image/png');
    });

    it('rejects non-image bytes', () => {
      expect(sniffImageMime(Buffer.from('not an image'))).toBeNull();
    });
  });

  describe('validateAvatarBytes', () => {
    it('rejects unsupported declared type', () => {
      const out = validateAvatarBytes(PNG_1X1, 'image/gif');
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.statusCode).toBe(415);
      }
    });

    it('accepts png with matching content type', () => {
      const out = validateAvatarBytes(PNG_1X1, 'image/png');
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.mime).toBe('image/png');
      }
    });
  });

  describe('parseMultipartSingleFile', () => {
    it('rejects oversize payload', () => {
      const boundary = 'testboundary';
      const huge = Buffer.alloc(FAN_AVATAR_MAX_BYTES + 1, 0x41);
      const body = buildMultipartBody(boundary, 'file', 'big.png', 'image/png', huge);
      const out = parseMultipartSingleFile(body, `multipart/form-data; boundary=${boundary}`, {
        fieldName: 'file',
        maxBytes: FAN_AVATAR_MAX_BYTES,
      });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.statusCode).toBe(413);
      }
    });

    it('parses file field', () => {
      const boundary = 'abc123';
      const body = buildMultipartBody(boundary, 'file', 'a.png', 'image/png', PNG_1X1);
      const out = parseMultipartSingleFile(body, `multipart/form-data; boundary=${boundary}`, {
        fieldName: 'file',
        maxBytes: FAN_AVATAR_MAX_BYTES,
      });
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.file.equals(PNG_1X1)).toBe(true);
      }
    });
  });

  describe('publicAvatarUrl', () => {
    it('joins base and key without double slashes', () => {
      expect(publicAvatarUrl('https://d111.cloudfront.net', 'avatars/sub/avatar.png')).toBe(
        'https://d111.cloudfront.net/avatars/sub/avatar.png',
      );
    });
  });
});

const dynamoSend = vi.fn();
const s3Send = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = s3Send;
  },
  PutObjectCommand: vi.fn((input: unknown) => ({ input, kind: 'put' })),
  DeleteObjectCommand: vi.fn((input: unknown) => ({ input, kind: 'del' })),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {},
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: dynamoSend }),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'get' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'update' })),
}));

describe('fan-avatar-post handler', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSend.mockReset();
    s3Send.mockReset();
    process.env.FAN_AVATARS_BUCKET_NAME = 'avatars-bucket';
    process.env.FAN_AVATARS_PUBLIC_BASE_URL = 'https://cdn.example.com';
    process.env.FAN_PROFILES_TABLE_NAME = 'FanProfiles';
    dynamoSend.mockResolvedValue({ Item: undefined });
    s3Send.mockResolvedValue({});
  });

  it('returns 401 without JWT sub', async () => {
    const { handler } = await import('./fan-avatar-post');
    const res = await handler({
      headers: { 'content-type': 'multipart/form-data; boundary=b' },
      body: '',
      requestContext: {},
    } as APIGatewayProxyEventV2);
    expect(res.statusCode).toBe(401);
  });

  it('uploads png and returns avatarUrl', async () => {
    const { handler } = await import('./fan-avatar-post');
    const boundary = 'xyz';
    const body = buildMultipartBody(boundary, 'file', 'me.png', 'image/png', PNG_1X1);
    const res = await handler({
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: body.toString('base64'),
      isBase64Encoded: true,
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'user-sub-1' } } },
      },
    } as APIGatewayProxyEventV2);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body ?? '{}') as {
      avatarUrl?: string;
      avatarUpdatedAt?: number;
    };
    expect(payload.avatarUrl).toBe('https://cdn.example.com/avatars/user-sub-1/avatar.png');
    expect(typeof payload.avatarUpdatedAt).toBe('number');
    expect(s3Send).toHaveBeenCalled();
    expect(dynamoSend).toHaveBeenCalled();
  });
});
