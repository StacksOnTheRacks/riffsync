#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApiCatalogStack } from '../lib/api-catalog-stack';
import { FanAuthStack } from '../lib/fan-auth-stack';
import { StaticSiteStack } from '../lib/static-site-stack';

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

const fanAuth = new FanAuthStack(app, `RiffSyncFanAuth-${environment}`, {
  description: `RiffSync fan Cognito (${environment}) — Hosted UI + Facebook IdP (host JWT)`,
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new ApiCatalogStack(app, `RiffSyncApi-${environment}`, {
  description: `RiffSync HTTP API + Catalog + Rooms + WebSocket (${environment}) — DynamoDB + Lambda`,
  environment,
  fanUserPool: fanAuth.fanUserPool,
  fanUserPoolClient: fanAuth.fanUserPoolClient,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new StaticSiteStack(app, `RiffSyncStatic-${environment}`, {
  description: `RiffSync static SPA hosting (${environment}) — S3 (private) + CloudFront OAC`,
  environment,
  fanWebCustomDomain,
  fanWebCertificateArn,
  fanWebHostedZoneId,
  fanWebZoneName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
