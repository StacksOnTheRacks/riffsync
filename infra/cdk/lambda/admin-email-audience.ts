import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { requireAdminAccess } from './admin-staff-access';
import { countEligibleFanRecipients, logAdminEmailEvent } from './admin-email-shared';
import { jsonResponse } from './giphy-search-shared';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const denied = await requireAdminAccess(event);
  if (denied) {
    return denied;
  }

  try {
    const eligibleCount = await countEligibleFanRecipients();
    logAdminEmailEvent({
      mode: 'audience',
      requestId: event.requestContext.requestId,
      eligibleCount,
    });
    return jsonResponse(200, { eligibleCount });
  } catch (e) {
    console.error('admin-email-audience failed', e);
    return jsonResponse(503, { error: 'Could not load audience count', code: 'audience_unavailable' });
  }
};
