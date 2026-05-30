import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  getStaffJwtClaims,
  hasStaffRole,
  parseCognitoGroups,
} from './admin-session-shared';
import { jsonResponse } from './giphy-search-shared';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const claims = getStaffJwtClaims(event);
  const sub = typeof claims?.sub === 'string' ? claims.sub : undefined;

  if (!sub) {
    return jsonResponse(401, { error: 'Unauthorized', code: 'unauthorized' });
  }

  const groups = parseCognitoGroups(claims);
  if (!hasStaffRole(groups)) {
    return jsonResponse(403, { error: 'Forbidden', code: 'staff_group_required' });
  }

  const email = typeof claims?.email === 'string' && claims.email.length > 0 ? claims.email : null;
  return jsonResponse(200, { sub, email, groups });
};
