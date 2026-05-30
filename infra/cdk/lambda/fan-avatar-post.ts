import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import {
  assertSafeSubForS3Key,
  avatarObjectKey,
  extensionForMime,
  FAN_AVATAR_FORM_FIELD,
  FAN_AVATAR_MAX_BYTES,
  objectKeyFromAvatarUrl,
  parseMultipartSingleFile,
  publicAvatarUrl,
  validateAvatarBytes,
} from './fan-profile-avatar';
import { getJwtSub, headerValue } from './fan-profile-shared';
import { logRiffsyncDiagError, recordApiRoute, type FanAvatarUploadOutcome } from './riffsync-observability';

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function finish(outcome: FanAvatarUploadOutcome, statusCode: number, body: Record<string, unknown>, extras?: {
  fileSizeBytes?: number;
}) {
  recordApiRoute('FanAvatarUpload', outcome, extras);
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const bucket = process.env.FAN_AVATARS_BUCKET_NAME;
  const publicBaseUrl = process.env.FAN_AVATARS_PUBLIC_BASE_URL;
  const profilesTable = process.env.FAN_PROFILES_TABLE_NAME;

  if (!bucket || !publicBaseUrl || !profilesTable) {
    return finish('misconfigured', 500, { error: 'misconfigured_avatar_upload' });
  }

  const jwtSub = getJwtSub(event);
  if (!jwtSub) {
    return finish('unauthorized', 401, { error: 'Unauthorized' });
  }

  if (!assertSafeSubForS3Key(jwtSub)) {
    return finish('validation_error', 400, { error: 'invalid_sub' });
  }

  const contentType = headerValue(event.headers, 'content-type');
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64')
    : Buffer.from(event.body ?? '', 'utf8');

  const parsed = parseMultipartSingleFile(rawBody, contentType, {
    fieldName: FAN_AVATAR_FORM_FIELD,
    maxBytes: FAN_AVATAR_MAX_BYTES,
  });
  if (!parsed.ok) {
    return finish('validation_error', parsed.statusCode, { error: parsed.error });
  }

  const validated = validateAvatarBytes(parsed.file, parsed.partContentType);
  if (!validated.ok) {
    return finish('validation_error', validated.statusCode, { error: validated.error });
  }

  const ext = extensionForMime(validated.mime);
  const objectKey = avatarObjectKey(jwtSub, ext);
  const avatarUpdatedAt = Date.now();

  try {
    const existing = await dynamo.send(
      new GetCommand({
        TableName: profilesTable,
        Key: { sub: jwtSub },
      }),
    );
    const priorUrl =
      typeof existing.Item?.avatarUrl === 'string' ? existing.Item.avatarUrl.trim() : undefined;
    const priorKey = priorUrl ? objectKeyFromAvatarUrl(priorUrl, publicBaseUrl) : null;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: parsed.file,
        ContentType: validated.mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    if (priorKey && priorKey !== objectKey) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: priorKey,
          }),
        );
      } catch {
        // Best-effort cleanup; new avatar URL is already valid.
      }
    }

    const avatarUrl = publicAvatarUrl(publicBaseUrl, objectKey);

    await dynamo.send(
      new UpdateCommand({
        TableName: profilesTable,
        Key: { sub: jwtSub },
        UpdateExpression: 'SET avatarUrl = :url, avatarUpdatedAt = :at',
        ExpressionAttributeValues: {
          ':url': avatarUrl,
          ':at': avatarUpdatedAt,
        },
      }),
    );
  } catch (e) {
    logRiffsyncDiagError('fan_avatar_upload_failed', e);
    return finish('server_error', 500, { error: 'avatar_upload_failed' });
  }

  return finish('success', 200, { avatarUrl: publicAvatarUrl(publicBaseUrl, objectKey), avatarUpdatedAt }, {
    fileSizeBytes: parsed.file.length,
  });
};
