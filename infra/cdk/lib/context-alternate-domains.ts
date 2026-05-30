import type { Construct } from 'constructs';

/**
 * Optional **`fanWebAlternateDomainNames`** CDK context: comma-separated DNS names
 * (e.g. `www.riffsync.tv`) added as CloudFront aliases + Route 53 aliases (with primary
 * **`fanWebCustomDomain`**) + prod CORS / Cognito SPA callback URLs. ACM must cover every name.
 */
export function fanWebAlternateDomainNamesFromContext(scope: Construct): string[] {
  const raw = scope.node.tryGetContext('fanWebAlternateDomainNames');
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function oauthCallbacksForHost(hostname: string): string[] {
  const h = hostname.replace(/\.$/, '').toLowerCase();
  return [`https://${h}/`, `https://${h}/auth/callback`];
}

/** Staff admin SPA OAuth allowlist paths under `/admin/*`. */
export function oauthAdminCallbacksForHost(hostname: string): string[] {
  const h = hostname.replace(/\.$/, '').toLowerCase();
  return [`https://${h}/admin/auth/callback`, `https://${h}/admin/login`];
}
