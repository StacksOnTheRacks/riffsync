#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { ApiCatalogStack } from '../lib/api-catalog-stack';
import { FanAuthStack } from '../lib/fan-auth-stack';
import { StaffAuthStack } from '../lib/staff-auth-stack';
import { SesInboundStack, sesInboundReceiptRulesActivated } from '../lib/ses-inbound-stack';
import { StaticSiteStack } from '../lib/static-site-stack';
import { MediaServerStack } from '../lib/media-server-stack';

function trimContext(app: cdk.App, key: string): string | undefined {
  const v = app.node.tryGetContext(key);
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
}

const app = new cdk.App();

const rawEnv = app.node.tryGetContext('environment');
if (rawEnv !== undefined && rawEnv !== 'prod') {
  throw new Error(
    'Hosted staging was removed. Use --context environment=prod (or omit; see cdk.json).',
  );
}

const fanWebCustomDomain = trimContext(app, 'fanWebCustomDomain');
const fanWebCertificateArn = trimContext(app, 'fanWebCertificateArn');
const fanWebHostedZoneId = trimContext(app, 'fanWebHostedZoneId');
const fanWebZoneName = trimContext(app, 'fanWebZoneName');

if ((fanWebCustomDomain !== undefined) !== (fanWebCertificateArn !== undefined)) {
  throw new Error(
    'Set both fanWebCustomDomain and fanWebCertificateArn (ACM in us-east-1), or omit both.',
  );
}
if ((fanWebHostedZoneId !== undefined) !== (fanWebZoneName !== undefined)) {
  throw new Error('Set both fanWebHostedZoneId and fanWebZoneName, or omit both.');
}
if ((fanWebHostedZoneId || fanWebZoneName) && !fanWebCustomDomain) {
  throw new Error('fanWebHostedZoneId / fanWebZoneName require fanWebCustomDomain + fanWebCertificateArn.');
}

/**
 * Default **`SFU_PUBLIC_WS_URL`** for **`WebrtcSfuTokenFn`** must be a **plain synth-time string** — never
 * a **`Token`** from **`eip.ref`** in another stack (cross-stack exports block updates).
 */
function sfuDefaultSignalingWsUrlFromContext(app: cdk.App, sfuProdSignalingHost: string | undefined): string {
  const fromCtx = trimContext(app, 'sfuPublicWsUrl');
  if (fromCtx) return fromCtx;
  if (sfuProdSignalingHost) {
    return `wss://${sfuProdSignalingHost.replace(/\.$/, '').toLowerCase()}`;
  }
  return '';
}

function parseFanWebAlternateDomains(a: cdk.App): string[] {
  const raw = trimContext(a, 'fanWebAlternateDomainNames');
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

const fanWebAlternateDomainNames = parseFanWebAlternateDomains(app);
const fanWebCanonicalHostname = trimContext(app, 'fanWebCanonicalHostname');

const sfuProdSignalingHostname = trimContext(app, 'sfuProdSignalingHostname');
if (sfuProdSignalingHostname && !(fanWebHostedZoneId && fanWebZoneName)) {
  throw new Error(
    'sfuProdSignalingHostname requires fanWebHostedZoneId and fanWebZoneName (Route 53 + ACM DNS validation).',
  );
}

const sfuSignalingHostedZone =
  sfuProdSignalingHostname && fanWebHostedZoneId && fanWebZoneName
    ? route53.HostedZone.fromHostedZoneAttributes(app, 'RiffSyncSfuDnsZone', {
        hostedZoneId: fanWebHostedZoneId,
        zoneName: fanWebZoneName,
      })
    : undefined;

const fanAuth = new FanAuthStack(app, 'RiffSyncFanAuth-prod', {
  description: 'RiffSync fan Cognito (prod) — Hosted UI + local accounts (host JWT)',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const staffAuth = new StaffAuthStack(app, 'RiffSyncStaffAuth-prod', {
  description: 'RiffSync staff Cognito (prod) — invite-only Hosted UI + admin/curator groups',
  sesSendingConfigurationSetName: fanAuth.sesSendingConfigurationSetName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
staffAuth.addDependency(fanAuth);

/** Stack id stays **`RiffSyncTurn`** so the existing VPC + coturn resources remain in the same CFN stack. */
const mediaServer = new MediaServerStack(app, 'RiffSyncTurn', {
  signalingHostedZone: sfuSignalingHostedZone,
  signalingZoneName: sfuProdSignalingHostname && fanWebZoneName ? fanWebZoneName : undefined,
  sfuProdSignalingHostname,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const apiCatalog = new ApiCatalogStack(app, 'RiffSyncApi-prod', {
  description: 'RiffSync HTTP API + Catalog + Rooms + WebSocket (prod) — DynamoDB + Lambda',
  fanUserPool: fanAuth.fanUserPool,
  fanUserPoolClient: fanAuth.fanUserPoolClient,
  sesSendingConfigurationSetName: fanAuth.sesSendingConfigurationSetName,
  turnSharedSecret: mediaServer.turnSharedSecret,
  sfuDefaultSignalingWsUrl: sfuDefaultSignalingWsUrlFromContext(app, sfuProdSignalingHostname),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
apiCatalog.addDependency(fanAuth);
apiCatalog.addDependency(staffAuth);
apiCatalog.addDependency(mediaServer);

new StaticSiteStack(app, 'RiffSyncStatic-prod', {
  description: 'RiffSync static SPA hosting (prod) — S3 (private) + CloudFront OAC',
  fanWebCustomDomain,
  fanWebCertificateArn,
  fanWebHostedZoneId,
  fanWebZoneName,
  fanWebAlternateDomainNames,
  fanWebCanonicalHostname,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

/** Shared SES receive pipeline — one stack name/topic/rule set for the hosted app. */
new SesInboundStack(app, 'RiffSyncSesInbound', {
  description: 'RiffSync SES inbound → SNS',
  hostedZoneId: fanWebHostedZoneId,
  hostedZoneName: fanWebZoneName,
  activateReceiptRuleSet: sesInboundReceiptRulesActivated(app),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
