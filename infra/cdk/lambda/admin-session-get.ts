import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  decodeJwtPayload,
  getStaffJwtClaims,
  hasStaffRole,
  resolveStaffGroups,
} from './admin-session-shared';
import { jsonResponse } from './giphy-search-shared';

function resolveSub(event: APIGatewayProxyEventV2): string | undefined {
  const claims = getStaffJwtClaims(event);
  if (typeof claims?.sub === 'string' && claims.sub.length > 0) {
    return claims.sub;
  }
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const sub = decodeJwtPayload(auth.slice('Bearer '.length).trim())?.sub;
    if (typeof sub === 'string' && sub.length > 0) {
      return sub;
    }
  }
  return undefined;
}

function resolveEmail(event: APIGatewayProxyEventV2): string | null {
  const claims = getStaffJwtClaims(event);
  if (typeof claims?.email === 'string' && claims.email.length > 0) {
    return claims.email;
  }
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const email = decodeJwtPayload(auth.slice('Bearer '.length).trim())?.email;
    if (typeof email === 'string' && email.length > 0) {
      return email;
    }
  }
  return null;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const sub = resolveSub(event);

  if (!sub) {
    return jsonResponse(401, { error: 'Unauthorized', code: 'unauthorized' });
  }

  const groups = resolveStaffGroups(event);
  if (!hasStaffRole(groups)) {
    return jsonResponse(403, { error: 'Forbidden', code: 'staff_group_required' });
  }

  return jsonResponse(200, { sub, email: resolveEmail(event), groups });
};
