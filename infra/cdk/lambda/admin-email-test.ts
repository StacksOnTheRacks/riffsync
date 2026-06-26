import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { requireAdminAccess, resolveStaffSub } from './admin-staff-access';
import {
  createTestProof,
  logAdminEmailEvent,
  parseEmailDraft,
  renderEmailHtml,
  renderEmailPlainText,
  resolveStaffEmail,
  sendRenderedEmail,
} from './admin-email-shared';
import { jsonResponse } from './giphy-search-shared';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const denied = await requireAdminAccess(event);
  if (denied) {
    return denied;
  }

  const sub = resolveStaffSub(event);
  if (!sub) {
    return jsonResponse(401, { error: 'Unauthorized', code: 'unauthorized' });
  }

  const staffEmail = resolveStaffEmail(event);
  if (!staffEmail || !staffEmail.includes('@')) {
    return jsonResponse(400, {
      error: 'Staff email not available in session',
      code: 'staff_email_missing',
    });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const draft = parseEmailDraft(body);
  if (!draft) {
    return jsonResponse(400, { error: 'Invalid email draft', code: 'validation_error' });
  }

  const proofSecret = process.env.ADMIN_EMAIL_TEST_PROOF_SECRET?.trim();
  if (!proofSecret) {
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  const html = renderEmailHtml(draft.subject, draft.content);
  const text = renderEmailPlainText(draft.subject, draft.content);
  const testSentAt = new Date().toISOString();
  const reqId = event.requestContext.requestId;

  try {
    await sendRenderedEmail({
      toAddresses: [staffEmail],
      subject: `[RiffSync test] ${draft.subject}`,
      html,
      text,
    });
  } catch (e) {
    console.error('admin-email-test SES failed', e);
    return jsonResponse(502, { error: 'Test email could not be sent', code: 'ses_send_failed' });
  }

  const testProof = createTestProof(sub, draft.contentHash, testSentAt, proofSecret);

  logAdminEmailEvent({
    mode: 'test',
    requestId: reqId,
    operatorSub: sub,
    subject: draft.subject,
    contentHash: draft.contentHash,
    sentCount: 1,
    failedCount: 0,
  });

  return jsonResponse(200, {
    ok: true,
    contentHash: draft.contentHash,
    testSentAt,
    testProof,
    recipient: staffEmail,
  });
};
