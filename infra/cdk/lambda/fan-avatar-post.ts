import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

/**
 * Placeholder until POST /v1/fans/me/avatar is wired (fan profile avatar API issue).
 * Infrastructure grants S3 put/delete on `avatars/{sub}/` and sets FAN_AVATARS_* env vars.
 */
export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ error: 'avatar_upload_not_implemented' }),
});
