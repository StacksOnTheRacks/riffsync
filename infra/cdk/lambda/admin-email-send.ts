import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { requireAdminAccess, resolveStaffSub } from './admin-staff-access';
import {
  BROADCAST_CONFIRMATION_PHRASE,
  applyMergeTokens,
  computeContentHash,
  customerEmailSendEnabled,
  listEligibleFanRecipients,
  logAdminEmailEvent,
  maxBroadcastRecipients,
  parseEmailDraft,
  renderEmailHtml,
  renderEmailPlainText,
  sendRenderedEmail,
  verifyTestProof,
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

  if (!customerEmailSendEnabled()) {
    return jsonResponse(403, {
      error: 'Customer email broadcast is disabled',
      code: 'customer_email_send_disabled',
    });
  }

  const sub = resolveStaffSub(event);
  if (!sub) {
    return jsonResponse(401, { error: 'Unauthorized', code: 'unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const confirmation =
    typeof body.confirmationPhrase === 'string' ? body.confirmationPhrase.trim() : '';
  if (confirmation !== BROADCAST_CONFIRMATION_PHRASE) {
    return jsonResponse(400, {
      error: 'Confirmation phrase required',
      code: 'confirmation_required',
    });
  }

  const draft = parseEmailDraft(body);
  if (!draft) {
    return jsonResponse(400, { error: 'Invalid email draft', code: 'validation_error' });
  }

  const clientContentHash = typeof body.contentHash === 'string' ? body.contentHash.trim() : '';
  if (clientContentHash !== draft.contentHash) {
    return jsonResponse(409, {
      error: 'Content hash mismatch',
      code: 'content_hash_mismatch',
    });
  }

  const audienceCount =
    typeof body.audienceCount === 'number' && Number.isInteger(body.audienceCount)
      ? body.audienceCount
      : Number.NaN;
  if (!Number.isFinite(audienceCount) || audienceCount < 0) {
    return jsonResponse(400, { error: 'Invalid audience count', code: 'validation_error' });
  }

  const testSentAt = typeof body.testSentAt === 'string' ? body.testSentAt.trim() : '';
  const testProof = typeof body.testProof === 'string' ? body.testProof.trim() : '';
  const proofSecret = process.env.ADMIN_EMAIL_TEST_PROOF_SECRET?.trim();
  if (!proofSecret) {
    return jsonResponse(500, { error: 'Server misconfigured' });
  }
  if (!verifyTestProof(sub, draft.contentHash, testSentAt, testProof, proofSecret)) {
    return jsonResponse(409, {
      error: 'Send a test email for this draft before broadcasting',
      code: 'test_required',
    });
  }

  let recipients: Awaited<ReturnType<typeof listEligibleFanRecipients>>;
  try {
    recipients = await listEligibleFanRecipients();
  } catch (e) {
    console.error('admin-email-send recipient load failed', e);
    return jsonResponse(503, {
      error: 'Could not load customer recipients',
      code: 'audience_unavailable',
    });
  }

  if (recipients.length !== audienceCount) {
    return jsonResponse(409, {
      error: 'Audience count changed since preview',
      code: 'audience_count_mismatch',
      eligibleCount: recipients.length,
    });
  }

  const cap = maxBroadcastRecipients();
  if (cap !== null && recipients.length > cap) {
    return jsonResponse(403, {
      error: `Broadcast exceeds rollout limit (${cap})`,
      code: 'broadcast_limit_exceeded',
    });
  }

  if (recipients.length === 0) {
    return jsonResponse(400, {
      error: 'No eligible customer recipients',
      code: 'no_recipients',
    });
  }

  const reqId = event.requestContext.requestId;

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      const html = renderEmailHtml(draft.subject, draft.content, recipient);
      const text = renderEmailPlainText(draft.subject, draft.content, recipient);
      await sendRenderedEmail({
        toAddresses: [recipient.email],
        subject: applyMergeTokens(draft.subject, recipient),
        html,
        text,
      });
      sentCount += 1;
    } catch (e) {
      failedCount += 1;
      console.error('admin-email-send SES failed for recipient', { requestId: reqId, failedCount, e });
    }
  }

  logAdminEmailEvent({
    mode: 'broadcast',
    requestId: reqId,
    operatorSub: sub,
    subject: draft.subject,
    contentHash: computeContentHash(draft.subject, draft.content),
    eligibleCount: recipients.length,
    sentCount,
    failedCount,
  });

  if (sentCount === 0) {
    return jsonResponse(502, {
      error: 'Broadcast could not deliver any messages',
      code: 'ses_send_failed',
      sentCount,
      failedCount,
    });
  }

  return jsonResponse(200, {
    ok: true,
    sentCount,
    failedCount,
    eligibleCount: recipients.length,
  });
};
