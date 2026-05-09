#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
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

const turnServer = new TurnServerStack(app, 'RiffSyncTurn', {
  description:
    'RiffSync coturn TURN relay (account singleton) — EC2 + EIP; secret riffsync/turn-static-auth-secret',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const sfuServer = new SfuServerStack(app, 'RiffSyncSfu', {
  description:
    'RiffSync mediasoup SFU (account singleton) - EC2 + EIP + join JWT secret; same VPC as RiffSyncTurn',
  sharedMediaVpc: turnServer.sharedMediaVpc,
  signalingHostedZone: sfuSignalingHostedZone,
  signalingZoneName: sfuProdSignalingHostname && fanWebZoneName ? fanWebZoneName : undefined,
  sfuProdSignalingHostname,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
sfuServer.addDependency(turnServer);

const apiCatalog = new ApiCatalogStack(app, 'RiffSyncApi-prod', {
  description: 'RiffSync HTTP API + Catalog + Rooms + WebSocket (prod) — DynamoDB + Lambda',
  fanUserPool: fanAuth.fanUserPool,
  fanUserPoolClient: fanAuth.fanUserPoolClient,
  sesSendingConfigurationSetName: fanAuth.sesSendingConfigurationSetName,
  turnSharedSecret: turnServer.turnSharedSecret,
  sfuJoinTokenSecret: sfuServer.sfuJoinTokenSecret,
  sfuDefaultSignalingWsUrl: sfuServer.defaultSignalingWsUrl,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
apiCatalog.addDependency(fanAuth);
apiCatalog.addDependency(turnServer);
apiCatalog.addDependency(sfuServer);

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
