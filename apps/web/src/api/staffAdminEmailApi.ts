import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from './staffAdminSessionApi'
import type { EmailContent } from '../admin/email/emailContentModel'

export interface StaffEmailAudienceResponse {
  eligibleCount: number
}

export interface StaffEmailTestResponse {
  ok: true
  contentHash: string
  testSentAt: string
  testProof: string
  recipient: string
}

export interface StaffEmailSendResponse {
  ok: true
  sentCount: number
  failedCount: number
  eligibleCount: number
}

export class StaffEmailValidationError extends Error {
  readonly statusCode = 400
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'StaffEmailValidationError'
    this.code = code
  }
}

export class StaffEmailConflictError extends Error {
  readonly statusCode = 409
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'StaffEmailConflictError'
    this.code = code
  }
}

export class StaffEmailDisabledError extends Error {
  readonly statusCode = 403
  readonly code = 'customer_email_send_disabled'

  constructor() {
    super('Customer email broadcast is disabled in this environment.')
    this.name = 'StaffEmailDisabledError'
  }
}

function staffEmailJsonHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function mapStaffEmailError(res: Response): Promise<never> {
  if (res.status === 401) {
    throw new StaffSessionUnauthorizedError()
  }
  if (res.status === 403) {
    let code = 'staff_group_required'
    try {
      const parsed = (await res.json()) as { code?: string }
      if (parsed.code === 'customer_email_send_disabled') {
        throw new StaffEmailDisabledError()
      }
      code = parsed.code ?? code
    } catch (e) {
      if (e instanceof StaffEmailDisabledError) throw e
    }
    throw new StaffSessionForbiddenError(
      code === 'staff_group_required'
        ? 'Admin group required for email tools'
        : 'Forbidden',
    )
  }
  let parsed: { code?: string; error?: string; eligibleCount?: number } = {}
  try {
    parsed = (await res.json()) as typeof parsed
  } catch {
    /* ignore */
  }
  const code = parsed.code ?? 'request_failed'
  const message = parsed.error ?? 'Email request failed'
  if (res.status === 409) {
    throw new StaffEmailConflictError(code, message)
  }
  if (res.status === 400) {
    throw new StaffEmailValidationError(code, message)
  }
  throw new Error(message)
}

export async function fetchStaffEmailAudience(accessToken: string): Promise<StaffEmailAudienceResponse> {
  const base = getPublicApiBaseUrl()
  const res = await fetch(`${base}/v1/admin/email/audience`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    await mapStaffEmailError(res)
  }
  return (await res.json()) as StaffEmailAudienceResponse
}

export async function sendStaffEmailTest(
  accessToken: string,
  payload: { subject: string; content: EmailContent },
): Promise<StaffEmailTestResponse> {
  const base = getPublicApiBaseUrl()
  const res = await fetch(`${base}/v1/admin/email/test`, {
    method: 'POST',
    headers: staffEmailJsonHeaders(accessToken),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await mapStaffEmailError(res)
  }
  return (await res.json()) as StaffEmailTestResponse
}

export async function sendStaffEmailBroadcast(
  accessToken: string,
  payload: {
    subject: string
    content: EmailContent
    confirmationPhrase: string
    contentHash: string
    audienceCount: number
    testSentAt: string
    testProof: string
  },
): Promise<StaffEmailSendResponse> {
  const base = getPublicApiBaseUrl()
  const res = await fetch(`${base}/v1/admin/email/send`, {
    method: 'POST',
    headers: staffEmailJsonHeaders(accessToken),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await mapStaffEmailError(res)
  }
  return (await res.json()) as StaffEmailSendResponse
}
