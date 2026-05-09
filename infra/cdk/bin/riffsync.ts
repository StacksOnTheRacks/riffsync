#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApiCatalogStack } from '../lib/api-catalog-stack';
import { FanAuthStack } from '../lib/fan-auth-stack';
import { SesInboundStack, sesInboundReceiptRulesActivated } from '../lib/ses-inbound-stack';
import { StaticSiteStack } from '../lib/static-site-stack';
import { TurnServerStack } from '../lib/turn-server-stack';
import { SfuServerStack } from '../lib/sfu-server-stack';

function trimContext(app: cdk.App, key: string): string | undefined {
  const v = app.node.tryGetContext(key);
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
}

const app = new cdk.App();

const raw = app.node.tryGetContext('environment');
if (typeof raw !== 'string' || (raw !== 'staging' && raw !== 'prod')) {
  throw new Error(
    'Set CDK context environment=staging|prod (hosted tiers only). Example: npx cdk synth --all --context environment=staging',
  );
}
const environment = raw as 'staging' | 'prod';

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

const fanAuth = new FanAuthStack(app, `RiffSyncFanAuth-${environment}`, {
  description: `RiffSync fan Cognito (${environment}) — Hosted UI + local accounts (host JWT)`,
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const turnServer = new TurnServerStack(app, 'RiffSyncTurn', {
  description:
    'RiffSync coturn TURN relay (shared staging+prod) — EC2 + EIP; secret riffsync/turn-static-auth-secret',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const sfuServer = new SfuServerStack(app, 'RiffSyncSfu', {
  description:
    'RiffSync mediasoup SFU (shared staging+prod) - EC2 + EIP + join JWT secret',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const apiCatalog = new ApiCatalogStack(app, `RiffSyncApi-${environment}`, {
  description: `RiffSync HTTP API + Catalog + Rooms + WebSocket (${environment}) — DynamoDB + Lambda`,
  environment,
  fanUserPool: fanAuth.fanUserPool,
  fanUserPoolClient: fanAuth.fanUserPoolClient,
  sesSendingConfigurationSetName: fanAuth.sesSendingConfigurationSetName,
  turnSharedSecret: turnServer.turnSharedSecret,
  sfuJoinTokenSecret: sfuServer.sfuJoinTokenSecret,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
apiCatalog.addDependency(fanAuth);
apiCatalog.addDependency(turnServer);
apiCatalog.addDependency(sfuServer);

new StaticSiteStack(app, `RiffSyncStatic-${environment}`, {
  description: `RiffSync static SPA hosting (${environment}) — S3 (private) + CloudFront OAC`,
  environment,
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

/** Shared SES receive pipeline — one stack name/topic/rule set for all app tiers (staging uses same mail infra). */
if (environment === 'prod') {
  new SesInboundStack(app, 'RiffSyncSesInbound', {
    description: 'RiffSync SES inbound → SNS (shared across staging/prod apps)',
    hostedZoneId: fanWebHostedZoneId,
    hostedZoneName: fanWebZoneName,
    activateReceiptRuleSet: sesInboundReceiptRulesActivated(app),
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  });
}
