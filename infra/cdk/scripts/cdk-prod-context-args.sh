#!/usr/bin/env bash
# Emit one line per argv token for: mapfile -t CDK_CTX < <(bash scripts/cdk-prod-context-args.sh)
# Expects the same PROD_* / RIFFSYNC_* env vars as .github/workflows/deploy-prod.yml.
set -euo pipefail
args=(--context environment=prod)
if [[ -n "${PROD_FAN_WEB_HOSTNAME:-}" && -n "${PROD_FAN_WEB_CERTIFICATE_ARN:-}" ]]; then
  args+=(--context "fanWebCustomDomain=${PROD_FAN_WEB_HOSTNAME}")
  args+=(--context "fanWebCertificateArn=${PROD_FAN_WEB_CERTIFICATE_ARN}")
fi
if [[ -n "${RIFFSYNC_ROUTE53_HOSTED_ZONE_ID:-}" && -n "${RIFFSYNC_ROUTE53_ZONE_NAME:-}" ]]; then
  args+=(--context "fanWebHostedZoneId=${RIFFSYNC_ROUTE53_HOSTED_ZONE_ID}")
  args+=(--context "fanWebZoneName=${RIFFSYNC_ROUTE53_ZONE_NAME}")
fi
if [[ -n "${PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES:-}" ]]; then
  args+=(--context "fanWebAlternateDomainNames=${PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES}")
fi
if [[ -n "${PROD_FAN_WEB_CANONICAL_HOSTNAME:-}" ]]; then
  args+=(--context "fanWebCanonicalHostname=${PROD_FAN_WEB_CANONICAL_HOSTNAME}")
fi
if [[ -n "${PROD_TURN_HOST:-}" ]]; then
  args+=(--context "turnHost=${PROD_TURN_HOST}")
fi
if [[ -n "${PROD_TURN_PORT:-}" ]]; then
  args+=(--context "turnPort=${PROD_TURN_PORT}")
fi
if [[ -n "${PROD_TURN_TLS_PORT:-}" ]]; then
  args+=(--context "turnTlsPort=${PROD_TURN_TLS_PORT}")
fi
if [[ -n "${PROD_TURN_CREDENTIAL_TTL_SECONDS:-}" ]]; then
  args+=(--context "turnCredentialTtlSeconds=${PROD_TURN_CREDENTIAL_TTL_SECONDS}")
fi
if [[ -n "${PROD_SFU_PUBLIC_WS_URL:-}" ]]; then
  args+=(--context "sfuPublicWsUrl=${PROD_SFU_PUBLIC_WS_URL}")
fi
if [[ -n "${PROD_SFU_SIGNALING_HOSTNAME:-}" ]]; then
  args+=(--context "sfuProdSignalingHostname=${PROD_SFU_SIGNALING_HOSTNAME}")
fi
printf '%s\n' "${args[@]}"
