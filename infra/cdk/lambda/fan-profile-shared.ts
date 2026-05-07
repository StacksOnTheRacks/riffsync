import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const FAN_DISPLAY_NAME_MAX_LEN = 48;

interface JwtClaims {
  sub?: string;
}

export function getJwtSub(event: Parameters<APIGatewayProxyHandlerV2>[0]): string | undefined {
  const claims = (
    event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: JwtClaims } };
    }
  ).authorizer?.jwt?.claims;
  return typeof claims?.sub === 'string' ? claims.sub : undefined;
}
