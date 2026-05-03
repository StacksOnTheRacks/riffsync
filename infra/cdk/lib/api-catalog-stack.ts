import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import type { Construct } from 'constructs';

export interface ApiCatalogStackProps extends cdk.StackProps {
  readonly environment: 'staging' | 'prod';
  /**
   * Extra CORS origins (e.g. staging CloudFront `https://dxxxx.cloudfront.net`).
   * Comma-separated in CDK context `catalogCorsOrigins`.
   */
  readonly extraCorsOrigins?: string[];
}

function parseOriginsFromContext(scope: Construct): string[] {
  const raw = scope.node.tryGetContext('catalogCorsOrigins');
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsAllowOrigins(environment: 'staging' | 'prod', extras: string[]): string[] {
  const base =
    environment === 'prod'
      ? ['https://riffsync.tv']
      : [
          'https://riffsync.tv',
          'http://localhost:5173',
          'http://localhost:3000',
          'http://127.0.0.1:5173',
          'https://localhost:5173',
        ];
  return [...new Set([...base, ...extras])];
}

/**
 * DynamoDB **Catalog** table + HTTP API **`GET /v1/catalog`** and **`GET /v1/catalog/{id}`**.
 *
 * **Access:** partition key **`id`** (stable episode slug). **`GET /v1/catalog`** uses **`Scan`**
 * (acceptable for MVP catalog size); **`GET /v1/catalog/{id}`** uses **`GetItem`**.
 * For large catalogs, add a GSI or snapshot/cache; see **`docs/architecture.server.md`**.
 */
export class ApiCatalogStack extends cdk.Stack {
  public readonly catalogTable: dynamodb.Table;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly tmdbApiTokenSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: ApiCatalogStackProps) {
    super(scope, id, props);

    const { environment, extraCorsOrigins = [] } = props;
    const contextExtras = parseOriginsFromContext(this);
    const allowOrigins = corsAllowOrigins(environment, [...extraCorsOrigins, ...contextExtras]);

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', environment);

    this.catalogTable = new dynamodb.Table(this, 'CatalogTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification:
        environment === 'prod' ? { pointInTimeRecoveryEnabled: true } : undefined,
    });

    this.tmdbApiTokenSecret = new secretsmanager.Secret(this, 'TmdbApiToken', {
      secretName: `riffsync/${environment}/tmdb-api-token`,
      description:
        'TMDB API bearer token for catalog reconcile (replace via AWS Console or put-secret-value).',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_WITH_TMDB_BEARER_TOKEN'),
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const catalogListFn = new lambdaNodejs.NodejsFunction(this, 'CatalogListFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/catalog-list.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(29),
      memorySize: 256,
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    const catalogGetFn = new lambdaNodejs.NodejsFunction(this, 'CatalogGetFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/catalog-get.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    this.catalogTable.grantReadData(catalogListFn);
    this.catalogTable.grantReadData(catalogGetFn);

    const reconcileBatchSizeRaw = this.node.tryGetContext('catalogReconcileBatchSize');
    const reconcileBatchSize =
      typeof reconcileBatchSizeRaw === 'number'
        ? reconcileBatchSizeRaw
        : typeof reconcileBatchSizeRaw === 'string'
          ? Number.parseInt(reconcileBatchSizeRaw, 10) || 15
          : 15;

    const reconcileDisabled =
      this.node.tryGetContext('catalogReconcileDisabled') === true ||
      this.node.tryGetContext('catalogReconcileDisabled') === 'true';
    const reconcileScheduleOff =
      this.node.tryGetContext('catalogReconcileScheduleEnabled') === false ||
      this.node.tryGetContext('catalogReconcileScheduleEnabled') === 'false';

    const tmdbReconcileFn = new lambdaNodejs.NodejsFunction(this, 'TmdbReconcileFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/tmdb-reconcile-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        TMDB_SECRET_ARN: this.tmdbApiTokenSecret.secretArn,
        RIFFSYNC_ENVIRONMENT: environment,
        RECONCILE_BATCH_SIZE: String(reconcileBatchSize),
        RECONCILE_DISABLED: reconcileDisabled ? 'true' : 'false',
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    this.catalogTable.grantReadWriteData(tmdbReconcileFn);
    this.tmdbApiTokenSecret.grantRead(tmdbReconcileFn);

    if (!reconcileScheduleOff) {
      const reconcileRule = new events.Rule(this, 'TmdbReconcileSchedule', {
        description: `TMDB catalog enrichment (${environment}) — disable: context catalogReconcileScheduleEnabled=false, EventBridge console, or env RECONCILE_DISABLED`,
        schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      });
      reconcileRule.addTarget(new eventsTargets.LambdaFunction(tmdbReconcileFn));
    }

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `riffsync-${environment}-http`,
      description: `RiffSync public HTTP API (${environment})`,
      corsPreflight: {
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins,
        maxAge: cdk.Duration.days(1),
      },
    });

    const listIntegration = new integrations.HttpLambdaIntegration(
      'CatalogListIntegration',
      catalogListFn,
    );
    const getIntegration = new integrations.HttpLambdaIntegration(
      'CatalogGetIntegration',
      catalogGetFn,
    );

    this.httpApi.addRoutes({
      path: '/v1/catalog',
      methods: [apigwv2.HttpMethod.GET],
      integration: listIntegration,
    });

    this.httpApi.addRoutes({
      path: '/v1/catalog/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: getIntegration,
    });

    new cdk.CfnOutput(this, 'CatalogTableName', {
      value: this.catalogTable.tableName,
      description: 'DynamoDB Catalog table — partition key `id` (episode slug).',
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'HTTP API base URL (HTTPS). Append `/v1/catalog`.',
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: this.httpApi.httpApiId,
    });

    new cdk.CfnOutput(this, 'TmdbApiTokenSecretArn', {
      value: this.tmdbApiTokenSecret.secretArn,
      description: 'Set to a real TMDB bearer token (not a v3 api_key query param in git).',
    });

    new cdk.CfnOutput(this, 'TmdbReconcileFnName', {
      value: tmdbReconcileFn.functionName,
      description: 'Invoke manually: aws lambda invoke --function-name … out.json',
    });
  }
}
