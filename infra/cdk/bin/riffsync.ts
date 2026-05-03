#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApiCatalogStack } from '../lib/api-catalog-stack';
import { StaticSiteStack } from '../lib/static-site-stack';

const app = new cdk.App();

const raw = app.node.tryGetContext('environment');
if (typeof raw !== 'string' || (raw !== 'staging' && raw !== 'prod')) {
  throw new Error(
    'Set CDK context environment=staging|prod (hosted tiers only). Example: npx cdk synth --all --context environment=staging',
  );
}
const environment = raw as 'staging' | 'prod';

new ApiCatalogStack(app, `RiffSyncApi-${environment}`, {
  description: `RiffSync HTTP API + Catalog (${environment}) — DynamoDB + Lambda`,
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new StaticSiteStack(app, `RiffSyncStatic-${environment}`, {
  description: `RiffSync static SPA hosting (${environment}) — S3 (private) + CloudFront OAC`,
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
