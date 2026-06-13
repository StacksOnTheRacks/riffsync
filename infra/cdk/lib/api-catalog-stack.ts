import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Auth from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import type { Construct } from 'constructs';

import { fanWebAlternateDomainNamesFromContext } from './context-alternate-domains';
import { SFU_ADMIN_SECRET_NAME, SFU_JOIN_SECRET_NAME } from './media-server-stack';

export interface ApiCatalogStackProps extends cdk.StackProps {
  /**
   * Extra CORS origins (e.g. CloudFront default `https://dxxxx.cloudfront.net`).
   * Comma-separated in CDK context `catalogCorsOrigins`.
   */
  readonly extraCorsOrigins?: string[];
  /**
   * Fan Cognito pool + SPA client for HTTP / WebSocket JWT validation (**M5**).
   */
  readonly fanUserPool: cognito.IUserPool;
  readonly fanUserPoolClient: cognito.IUserPoolClient;
  /** Staff Cognito pool + SPA client for `/v1/admin/*` JWT validation (**M11**). */
  readonly staffUserPool: cognito.IUserPool;
  readonly staffUserPoolClient: cognito.IUserPoolClient;
  /** SES sending configuration set — Cognito + privacy-removal **`SendEmail`** emit events to SNS via this set. */
  readonly sesSendingConfigurationSetName: string;
  /**
   * Shared TURN/coturn auth secret — owned by **[`MediaServerStack`](./media-server-stack.ts)** / **`RiffSyncTurn`** (**`riffsync/turn-static-auth-secret`**).
   */
  readonly turnSharedSecret: secretsmanager.ISecret;
  /**
   * Default **`SFU_PUBLIC_WS_URL`** when context **`sfuPublicWsUrl`** is unset — must be a **literal** at synth time
   * (see **`bin/riffsync.ts`**). SFU join HMAC is read by secret **name** **`riffsync/sfu-join-hmac-secret`** only (no cross-stack ARN).
   */
  readonly sfuDefaultSignalingWsUrl: string;
}

function sfuPublicWsUrlFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('sfuPublicWsUrl');
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Context **`sfuPublicWsUrl`** wins; otherwise use the literal default from **`bin/riffsync.ts`** (never an EIP token). */
function resolveSfuPublicWsUrl(scope: Construct, defaultFromSfuStack: string): string {
  const fromCtx = sfuPublicWsUrlFromContext(scope);
  if (fromCtx.length > 0) return fromCtx;
  return defaultFromSfuStack.trim();
}

function sfuAdminBaseUrlFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('sfuAdminBaseUrl');
  return typeof raw === 'string' ? raw.trim() : '';
}

function resolveSfuAdminBaseUrl(scope: Construct, signalingWsUrl: string): string {
  const fromCtx = sfuAdminBaseUrlFromContext(scope);
  if (fromCtx.length > 0) return fromCtx;
  const trimmed = signalingWsUrl.trim();
  if (trimmed.startsWith('wss://')) return `https://${trimmed.slice(6)}`;
  if (trimmed.startsWith('ws://')) return `http://${trimmed.slice(5)}`;
  return trimmed;
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

function staleRoomMsFromContext(scope: Construct): number {
  const raw = scope.node.tryGetContext('staleRoomMs');
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : 45 * 60 * 1000;
}

function turnHostFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('turnHost');
  return typeof raw === 'string' ? raw.trim() : '';
}

function turnPortFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('turnPort');
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= 65535 ? String(n) : '3478';
}

/** Empty string → omit `turns:` URIs from ICE config. */
function turnTlsPortFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('turnTlsPort');
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= 65535 ? String(n) : '';
}

function stunServersJsonFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('stunServersJson');
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.trim();
  }
  return '[{"urls":"stun:stun.l.google.com:19302"}]';
}

function turnCredentialTtlSecondsFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('turnCredentialTtlSeconds');
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  const ttl = Number.isFinite(n) && n >= 300 && n <= 86400 * 7 ? n : 43_200;
  return String(ttl);
}

function corsAllowOrigins(extras: string[], scope: Construct): string[] {
  const altOrigins = fanWebAlternateDomainNamesFromContext(scope).map((h) => `https://${h}`);
  const base = [
    'https://riffsync.tv',
    'https://www.riffsync.tv',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'https://localhost:5173',
  ];
  return [...new Set([...base, ...altOrigins, ...extras])];
}

const sharedLambdaBundle = {
  externalModules: ['@aws-sdk/*'],
};

/** S3 object keys: `avatars/{cognitoSub}/…` (one prefix per signed-in fan). */
const FAN_AVATAR_S3_KEY_PREFIX = 'avatars/';

/**
 * DynamoDB **Catalog** + **Rooms** + **Connections**, HTTP API (catalog, rooms, lobby),
 * WebSocket API (realtime), TMDB reconcile — see **`docs/architecture.server.md`**.
 */
export class ApiCatalogStack extends cdk.Stack {
  public readonly catalogTable: dynamodb.Table;
  public readonly roomsTable: dynamodb.Table;
  public readonly connectionsTable: dynamodb.Table;
  public readonly roomPresenceTable: dynamodb.Table;
  public readonly fanProfilesTable: dynamodb.Table;
  public readonly fanAvatarsBucket: s3.Bucket;
  public readonly fanAvatarsDistribution: cloudfront.Distribution;
  /** HTTPS origin for avatar object keys (no trailing slash). */
  public readonly fanAvatarsPublicBaseUrl: string;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly webSocketApi: apigwv2.WebSocketApi;
  public readonly tmdbApiTokenSecret: secretsmanager.ISecret;
  public readonly giphyApiKeySecret: secretsmanager.ISecret;
  public readonly turnSharedSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: ApiCatalogStackProps) {
    super(scope, id, props);

    const {
      extraCorsOrigins = [],
      fanUserPool,
      fanUserPoolClient,
      staffUserPool,
      staffUserPoolClient,
      sesSendingConfigurationSetName,
      turnSharedSecret,
      sfuDefaultSignalingWsUrl,
    } = props;
    const environment = 'prod';
    const contextExtras = parseOriginsFromContext(this);
    const allowOrigins = corsAllowOrigins([...extraCorsOrigins, ...contextExtras], this);
    const staleRoomMs = staleRoomMsFromContext(this);

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'prod');

    this.catalogTable = new dynamodb.Table(this, 'CatalogTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.roomsTable = new dynamodb.Table(this, 'RoomsTable', {
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.roomsTable.addGlobalSecondaryIndex({
      indexName: 'PublicLobbyIndex',
      partitionKey: { name: 'lobbyPk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lobbySk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'expiresAt',
    });

    this.roomPresenceTable = new dynamodb.Table(this, 'RoomPresenceTable', {
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'presenceKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'expiresAt',
    });

    this.fanProfilesTable = new dynamodb.Table(this, 'FanProfilesTable', {
      partitionKey: { name: 'sub', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.fanAvatarsBucket = new s3.Bucket(this, 'FanAvatarsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const fanAvatarsOac = new cloudfront.S3OriginAccessControl(this, 'FanAvatarsOac', {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
      originAccessControlName: 'riffsync-prod-fan-avatars-oac',
    });

    this.fanAvatarsDistribution = new cloudfront.Distribution(this, 'FanAvatarsDistribution', {
      comment: 'RiffSync prod fan avatars (private S3, public HTTPS via OAC)',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.fanAvatarsBucket, {
          originAccessControl: fanAvatarsOac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
    });

    this.fanAvatarsPublicBaseUrl = `https://${this.fanAvatarsDistribution.distributionDomainName}`;

    this.tmdbApiTokenSecret = new secretsmanager.Secret(this, 'TmdbApiToken', {
      secretName: `riffsync/${environment}/tmdb-api-token`,
      description:
        'TMDB API bearer token for catalog reconcile (replace via AWS Console or put-secret-value).',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_WITH_TMDB_BEARER_TOKEN'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.giphyApiKeySecret = new secretsmanager.Secret(this, 'GiphyApiKey', {
      secretName: `riffsync/${environment}/giphy-api-key`,
      description:
        'Giphy API key for GET /v1/giphy/search (replace via AWS Console or put-secret-value).',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_WITH_GIPHY_API_KEY'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const giphyRateLimitTable = new dynamodb.Table(this, 'GiphyRateLimitTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'expiresAt',
    });

    const privacyRoutingSecret = new secretsmanager.Secret(this, 'PrivacyRemovalRouting', {
      secretName: `riffsync/${environment}/privacy-removal-routing`,
      description:
        'JSON: {"notifyEmail":"you@example.com","fromEmail":"verified-sender@yourdomain"} — SES-verified fromEmail; notifyEmail receives submissions.',
      secretStringValue: cdk.SecretValue.unsafePlainText(
        '{"notifyEmail":"REPLACE_WITH_NOTIFY_EMAIL","fromEmail":"REPLACE_WITH_VERIFIED_SES_FROM"}',
      ),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.turnSharedSecret = turnSharedSecret;

    const catalogListFn = new lambdaNodejs.NodejsFunction(this, 'CatalogListFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(29),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/catalog-list.ts'),
      handler: 'handler',
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        CATALOG_HTTP_MAX_AGE_SECONDS: '60',
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    const catalogGetFn = new lambdaNodejs.NodejsFunction(this, 'CatalogGetFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/catalog-get.ts'),
      handler: 'handler',
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        CATALOG_HTTP_MAX_AGE_SECONDS: '60',
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
      bundling: sharedLambdaBundle,
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
        schedule: events.Schedule.rate(cdk.Duration.hours(2)),
      });
      reconcileRule.addTarget(new eventsTargets.LambdaFunction(tmdbReconcileFn));
    }

    const fanIssuer = `https://cognito-idp.${this.region}.amazonaws.com/${fanUserPool.userPoolId}`;
    const fanJwtAuthorizer = new apigwv2Auth.HttpJwtAuthorizer('FanJwtAuthorizer', fanIssuer, {
      jwtAudience: [fanUserPoolClient.userPoolClientId],
      authorizerName: `riffsync-fan-${environment}`,
    });

    const staffIssuer = `https://cognito-idp.${this.region}.amazonaws.com/${staffUserPool.userPoolId}`;
    const staffJwtAuthorizer = new apigwv2Auth.HttpJwtAuthorizer('StaffJwtAuthorizer', staffIssuer, {
      jwtAudience: [staffUserPoolClient.userPoolClientId],
      authorizerName: `riffsync-staff-${environment}`,
    });

    const jwtEnvShared = {
      NODE_OPTIONS: '--enable-source-maps',
    };

    const roomCreateFn = new lambdaNodejs.NodejsFunction(this, 'RoomCreateFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/room-create.ts'),
      handler: 'handler',
      environment: {
        ROOMS_TABLE_NAME: this.roomsTable.tableName,
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        ...jwtEnvShared,
      },
    });
    const smSmPrefix = `arn:${cdk.Aws.PARTITION}:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:`;
    const sfuPublicWsUrl = resolveSfuPublicWsUrl(this, sfuDefaultSignalingWsUrl);
    const sfuAdminBaseUrl = resolveSfuAdminBaseUrl(this, sfuPublicWsUrl);

    const roomPatchFn = new lambdaNodejs.NodejsFunction(this, 'RoomPatchFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/room-patch.ts'),
      handler: 'handler',
      environment: {
        ROOMS_TABLE_NAME: this.roomsTable.tableName,
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        RIFFSYNC_API_ENV: environment,
        SFU_ADMIN_SECRET_ID: SFU_ADMIN_SECRET_NAME,
        SFU_ADMIN_BASE_URL: sfuAdminBaseUrl,
        ...jwtEnvShared,
      },
    });
    const sfuAdminSecretResources = [
      cdk.Fn.join('', [smSmPrefix, SFU_ADMIN_SECRET_NAME, '*']),
      cdk.Fn.join('', [smSmPrefix, SFU_ADMIN_SECRET_NAME, '-*']),
    ];
    roomPatchFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: sfuAdminSecretResources,
      }),
    );
    roomPatchFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: [
          `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:alias/aws/secretsmanager`,
        ],
      }),
    );
    const roomGetFn = new lambdaNodejs.NodejsFunction(this, 'RoomGetFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/room-get.ts'),
      handler: 'handler',
      environment: {
        ROOMS_TABLE_NAME: this.roomsTable.tableName,
        ...jwtEnvShared,
      },
    });
    const lobbyGetFn = new lambdaNodejs.NodejsFunction(this, 'LobbyGetFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/lobby-get.ts'),
      handler: 'handler',
      environment: {
        ROOMS_TABLE_NAME: this.roomsTable.tableName,
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
        ROOM_PRESENCE_TABLE_NAME: this.roomPresenceTable.tableName,
        STALE_ROOM_MS: String(staleRoomMs),
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    this.roomsTable.grantReadWriteData(roomCreateFn);
    this.roomsTable.grantReadWriteData(roomPatchFn);
    this.catalogTable.grantReadData(roomCreateFn);
    this.catalogTable.grantReadData(roomPatchFn);
    this.roomsTable.grantReadData(roomGetFn);
    this.roomsTable.grantReadData(lobbyGetFn);
    this.connectionsTable.grantReadData(lobbyGetFn);
    this.roomPresenceTable.grantReadData(lobbyGetFn);

    const privacyRemovalFn = new lambdaNodejs.NodejsFunction(this, 'PrivacyRemovalRequestFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/privacy-removal-request.ts'),
      handler: 'handler',
      environment: {
        PRIVACY_ROUTING_SECRET_ARN: privacyRoutingSecret.secretArn,
        SES_CONFIGURATION_SET_NAME: sesSendingConfigurationSetName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    privacyRoutingSecret.grantRead(privacyRemovalFn);
    privacyRemovalFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: ['*'],
      }),
    );

    const webrtcIceConfigFn = new lambdaNodejs.NodejsFunction(this, 'WebrtcIceConfigFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/webrtc-ice-config.ts'),
      handler: 'handler',
      environment: {
        TURN_SHARED_SECRET_ARN: this.turnSharedSecret.secretArn,
        TURN_HOST: turnHostFromContext(this),
        TURN_PORT: turnPortFromContext(this),
        TURN_TLS_PORT: turnTlsPortFromContext(this),
        STUN_SERVERS_JSON: stunServersJsonFromContext(this),
        TURN_CREDENTIAL_TTL_SECONDS: turnCredentialTtlSecondsFromContext(this),
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    this.turnSharedSecret.grantRead(webrtcIceConfigFn);

    const webrtcSfuTokenFn = new lambdaNodejs.NodejsFunction(this, 'WebrtcSfuTokenFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/webrtc-sfu-token.ts'),
      handler: 'handler',
      environment: {
        ROOMS_TABLE_NAME: this.roomsTable.tableName,
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
        ROOM_PRESENCE_TABLE_NAME: this.roomPresenceTable.tableName,
        SFU_JOIN_SECRET_ID: SFU_JOIN_SECRET_NAME,
        RIFFSYNC_API_ENV: environment,
        RIFFSYNC_ENVIRONMENT: environment,
        SFU_PUBLIC_WS_URL: sfuPublicWsUrl,
        SFU_MAX_PRODUCERS_PER_ROOM: '24',
        COGNITO_USER_POOL_ID: fanUserPool.userPoolId,
        COGNITO_CLIENT_ID: fanUserPoolClient.userPoolClientId,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    /** Do not rely on `grantRead` for `fromSecretNameV2` alone: CDK may emit `??????` suffix ARNs that IAM does not treat as wildcards. */
    const sfuJoinSecretResources = [
      cdk.Fn.join('', [smSmPrefix, SFU_JOIN_SECRET_NAME, '*']),
      cdk.Fn.join('', [smSmPrefix, SFU_JOIN_SECRET_NAME, '-*']),
    ];
    webrtcSfuTokenFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: sfuJoinSecretResources,
      }),
    );
    /** Default secret uses AWS-managed CMK `alias/aws/secretsmanager` (some accounts require explicit decrypt). */
    webrtcSfuTokenFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: [
          `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:alias/aws/secretsmanager`,
        ],
      }),
    );
    this.connectionsTable.grantReadData(webrtcSfuTokenFn);
    this.roomPresenceTable.grantReadData(webrtcSfuTokenFn);
    this.roomsTable.grantReadData(webrtcSfuTokenFn);

    const fanProfileGetFn = new lambdaNodejs.NodejsFunction(this, 'FanProfileGetFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/fan-profile-get.ts'),
      handler: 'handler',
      environment: {
        FAN_PROFILES_TABLE_NAME: this.fanProfilesTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    const fanProfilePatchFn = new lambdaNodejs.NodejsFunction(this, 'FanProfilePatchFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/fan-profile-patch.ts'),
      handler: 'handler',
      environment: {
        FAN_PROFILES_TABLE_NAME: this.fanProfilesTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    this.fanProfilesTable.grantReadData(fanProfileGetFn);
    this.fanProfilesTable.grantReadWriteData(fanProfilePatchFn);

    const giphySearchFn = new lambdaNodejs.NodejsFunction(this, 'GiphySearchFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/giphy-search.ts'),
      handler: 'handler',
      environment: {
        GIPHY_SECRET_ARN: this.giphyApiKeySecret.secretArn,
        GIPHY_RATE_LIMIT_TABLE_NAME: giphyRateLimitTable.tableName,
        GIPHY_RATE_LIMIT_PER_MINUTE: '30',
        RIFFSYNC_ENVIRONMENT: environment,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    this.giphyApiKeySecret.grantRead(giphySearchFn);
    giphyRateLimitTable.grantReadWriteData(giphySearchFn);

    const adminSessionGetFn = new lambdaNodejs.NodejsFunction(this, 'AdminSessionGetFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/admin-session-get.ts'),
      handler: 'handler',
      environment: {
        STAFF_USER_POOL_ID: staffUserPool.userPoolId,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    adminSessionGetFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminListGroupsForUser'],
        resources: [staffUserPool.userPoolArn],
      }),
    );

    const adminCatalogListFn = new lambdaNodejs.NodejsFunction(this, 'AdminCatalogListFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(29),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/admin-catalog-list.ts'),
      handler: 'handler',
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        STAFF_USER_POOL_ID: staffUserPool.userPoolId,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    const adminCatalogGetFn = new lambdaNodejs.NodejsFunction(this, 'AdminCatalogGetFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/admin-catalog-get.ts'),
      handler: 'handler',
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        STAFF_USER_POOL_ID: staffUserPool.userPoolId,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    const adminCatalogPostFn = new lambdaNodejs.NodejsFunction(this, 'AdminCatalogPostFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/admin-catalog-post.ts'),
      handler: 'handler',
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        STAFF_USER_POOL_ID: staffUserPool.userPoolId,
        RIFFSYNC_ENVIRONMENT: environment,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    const adminCatalogPatchFn = new lambdaNodejs.NodejsFunction(this, 'AdminCatalogPatchFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/admin-catalog-patch.ts'),
      handler: 'handler',
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        STAFF_USER_POOL_ID: staffUserPool.userPoolId,
        RIFFSYNC_ENVIRONMENT: environment,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    const adminCatalogDeleteFn = new lambdaNodejs.NodejsFunction(this, 'AdminCatalogDeleteFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/admin-catalog-delete.ts'),
      handler: 'handler',
      environment: {
        CATALOG_TABLE_NAME: this.catalogTable.tableName,
        ROOMS_TABLE_NAME: this.roomsTable.tableName,
        STAFF_USER_POOL_ID: staffUserPool.userPoolId,
        RIFFSYNC_ENVIRONMENT: environment,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    this.catalogTable.grantReadData(adminCatalogListFn);
    this.catalogTable.grantReadData(adminCatalogGetFn);
    this.catalogTable.grantReadWriteData(adminCatalogPostFn);
    this.catalogTable.grantReadWriteData(adminCatalogPatchFn);
    this.catalogTable.grantReadWriteData(adminCatalogDeleteFn);
    this.roomsTable.grantReadData(adminCatalogDeleteFn);
    for (const fn of [
      adminCatalogListFn,
      adminCatalogGetFn,
      adminCatalogPostFn,
      adminCatalogPatchFn,
      adminCatalogDeleteFn,
    ]) {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['cognito-idp:AdminListGroupsForUser'],
          resources: [staffUserPool.userPoolArn],
        }),
      );
    }

    const fanAvatarPostFn = new lambdaNodejs.NodejsFunction(this, 'FanAvatarPostFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(29),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/fan-avatar-post.ts'),
      handler: 'handler',
      environment: {
        FAN_AVATARS_BUCKET_NAME: this.fanAvatarsBucket.bucketName,
        FAN_AVATARS_PUBLIC_BASE_URL: this.fanAvatarsPublicBaseUrl,
        FAN_PROFILES_TABLE_NAME: this.fanProfilesTable.tableName,
        RIFFSYNC_ENVIRONMENT: environment,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    this.fanAvatarsBucket.grantPut(fanAvatarPostFn, `${FAN_AVATAR_S3_KEY_PREFIX}*`);
    this.fanAvatarsBucket.grantDelete(fanAvatarPostFn, `${FAN_AVATAR_S3_KEY_PREFIX}*`);
    this.fanProfilesTable.grantReadWriteData(fanAvatarPostFn);

    /** WebSocket management URL (HTTPS) for `PostToConnection`. */
    this.webSocketApi = new apigwv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `riffsync-${environment}-ws`,
      description: `RiffSync WebSocket (${environment}) — ping, presence_request, chat, chat_gif, react, share_state, leave`,
      routeSelectionExpression: '$request.body.action',
    });

    const wsStage = new apigwv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: environment,
      autoDeploy: true,
    });

    const wsMgmtEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`;

    const wsSharedEnv = {
      ROOMS_TABLE_NAME: this.roomsTable.tableName,
      CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
      ROOM_PRESENCE_TABLE_NAME: this.roomPresenceTable.tableName,
      FAN_PROFILES_TABLE_NAME: this.fanProfilesTable.tableName,
      COGNITO_USER_POOL_ID: fanUserPool.userPoolId,
      COGNITO_CLIENT_ID: fanUserPoolClient.userPoolClientId,
      WS_MANAGEMENT_API_ENDPOINT: wsMgmtEndpoint,
      RIFFSYNC_ENVIRONMENT: environment,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const wsConnectFn = new lambdaNodejs.NodejsFunction(this, 'WsConnectFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/ws-connect.ts'),
      handler: 'handler',
      environment: wsSharedEnv,
    });
    const wsDisconnectFn = new lambdaNodejs.NodejsFunction(this, 'WsDisconnectFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/ws-disconnect.ts'),
      handler: 'handler',
      environment: {
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
        ROOM_PRESENCE_TABLE_NAME: this.roomPresenceTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    const wsRouteFn = new lambdaNodejs.NodejsFunction(this, 'WsRouteFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(25),
      memorySize: 256,
      bundling: sharedLambdaBundle,
      entry: path.join(__dirname, '../lambda/ws-route.ts'),
      handler: 'handler',
      environment: wsSharedEnv,
    });

    this.catalogTable.grantReadData(wsConnectFn);
    this.roomsTable.grantReadData(wsConnectFn);
    this.connectionsTable.grantReadWriteData(wsConnectFn);
    this.roomPresenceTable.grantReadWriteData(wsConnectFn);
    this.fanProfilesTable.grantReadData(wsConnectFn);

    this.connectionsTable.grantReadWriteData(wsDisconnectFn);
    this.roomPresenceTable.grantReadWriteData(wsDisconnectFn);

    this.roomsTable.grantReadWriteData(wsRouteFn);
    this.connectionsTable.grantReadWriteData(wsRouteFn);
    this.roomPresenceTable.grantReadWriteData(wsRouteFn);
    this.fanProfilesTable.grantReadData(wsRouteFn);
    this.webSocketApi.grantManageConnections(wsRouteFn);

    roomPatchFn.addEnvironment('WS_MANAGEMENT_API_ENDPOINT', wsMgmtEndpoint);
    roomPatchFn.addEnvironment('CONNECTIONS_TABLE_NAME', this.connectionsTable.tableName);
    roomPatchFn.addEnvironment('ROOM_PRESENCE_TABLE_NAME', this.roomPresenceTable.tableName);
    this.connectionsTable.grantReadData(roomPatchFn);
    this.roomPresenceTable.grantReadData(roomPatchFn);
    this.webSocketApi.grantManageConnections(roomPatchFn);

    // WebSocketLambdaIntegration can leave InvokeFunction scoped to only one route (IAM showed SourceArn ending in *ping).
    // chat/signaling/$default then fail invoke auth; API Gateway returns Internal server error on the WebSocket frame.
    wsRouteFn.addPermission('WsRouteFnAllowExecuteApiWebSocket', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/*`,
    });

    const wsConnectInt = new integrations.WebSocketLambdaIntegration('WsConnectInt', wsConnectFn);
    const wsDisconnectInt = new integrations.WebSocketLambdaIntegration('WsDisconnectInt', wsDisconnectFn);
    const wsRouteInt = new integrations.WebSocketLambdaIntegration('WsRouteInt', wsRouteFn);

    this.webSocketApi.addRoute('$connect', { integration: wsConnectInt });
    this.webSocketApi.addRoute('$disconnect', { integration: wsDisconnectInt });
    for (const key of [
      'ping',
      'presence_request',
      'chat',
      'chat_gif',
      'react',
      'rename',
      'share_state',
      'leave',
    ] as const) {
      this.webSocketApi.addRoute(key, { integration: wsRouteInt });
    }
    this.webSocketApi.addRoute('$default', { integration: wsRouteInt });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `riffsync-${environment}-http`,
      description: `RiffSync public HTTP API (${environment})`,
      corsPreflight: {
        // `if-none-match` required for fan SPA conditional catalog GET (triggers OPTIONS preflight).
        allowHeaders: ['content-type', 'authorization', 'x-session-id', 'if-none-match'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins,
        // SPA reads ETag for conditional GET; browsers hide it cross-origin unless exposed.
        exposeHeaders: ['ETag'],
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
    const roomCreateIntegration = new integrations.HttpLambdaIntegration('RoomCreateInt', roomCreateFn);
    const roomPatchIntegration = new integrations.HttpLambdaIntegration('RoomPatchInt', roomPatchFn);
    const roomGetIntegration = new integrations.HttpLambdaIntegration('RoomGetInt', roomGetFn);
    const lobbyGetIntegration = new integrations.HttpLambdaIntegration('LobbyGetInt', lobbyGetFn);
    const privacyRemovalIntegration = new integrations.HttpLambdaIntegration(
      'PrivacyRemovalInt',
      privacyRemovalFn,
    );
    const webrtcIceIntegration = new integrations.HttpLambdaIntegration('WebrtcIceInt', webrtcIceConfigFn);
    const webrtcSfuTokenIntegration = new integrations.HttpLambdaIntegration(
      'WebrtcSfuTokenInt',
      webrtcSfuTokenFn,
    );
    const fanProfileGetIntegration = new integrations.HttpLambdaIntegration('FanProfileGetInt', fanProfileGetFn);
    const fanProfilePatchIntegration = new integrations.HttpLambdaIntegration(
      'FanProfilePatchInt',
      fanProfilePatchFn,
    );
    const fanAvatarPostIntegration = new integrations.HttpLambdaIntegration(
      'FanAvatarPostInt',
      fanAvatarPostFn,
    );
    const giphySearchIntegration = new integrations.HttpLambdaIntegration(
      'GiphySearchInt',
      giphySearchFn,
    );
    const adminSessionGetIntegration = new integrations.HttpLambdaIntegration(
      'AdminSessionGetInt',
      adminSessionGetFn,
    );
    const adminCatalogListIntegration = new integrations.HttpLambdaIntegration(
      'AdminCatalogListInt',
      adminCatalogListFn,
    );
    const adminCatalogGetIntegration = new integrations.HttpLambdaIntegration(
      'AdminCatalogGetInt',
      adminCatalogGetFn,
    );
    const adminCatalogPostIntegration = new integrations.HttpLambdaIntegration(
      'AdminCatalogPostInt',
      adminCatalogPostFn,
    );
    const adminCatalogPatchIntegration = new integrations.HttpLambdaIntegration(
      'AdminCatalogPatchInt',
      adminCatalogPatchFn,
    );
    const adminCatalogDeleteIntegration = new integrations.HttpLambdaIntegration(
      'AdminCatalogDeleteInt',
      adminCatalogDeleteFn,
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

    this.httpApi.addRoutes({
      path: '/v1/rooms',
      methods: [apigwv2.HttpMethod.POST],
      integration: roomCreateIntegration,
      authorizer: fanJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/rooms/{roomId}',
      methods: [apigwv2.HttpMethod.GET],
      integration: roomGetIntegration,
    });

    this.httpApi.addRoutes({
      path: '/v1/rooms/{roomId}',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: roomPatchIntegration,
      authorizer: fanJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/lobby',
      methods: [apigwv2.HttpMethod.GET],
      integration: lobbyGetIntegration,
    });

    this.httpApi.addRoutes({
      path: '/v1/privacy-removal-request',
      methods: [apigwv2.HttpMethod.POST],
      integration: privacyRemovalIntegration,
    });

    this.httpApi.addRoutes({
      path: '/v1/webrtc/ice',
      methods: [apigwv2.HttpMethod.GET],
      integration: webrtcIceIntegration,
    });

    this.httpApi.addRoutes({
      path: '/v1/webrtc/sfu-token',
      methods: [apigwv2.HttpMethod.POST],
      integration: webrtcSfuTokenIntegration,
    });

    this.httpApi.addRoutes({
      path: '/v1/fans/me',
      methods: [apigwv2.HttpMethod.GET],
      integration: fanProfileGetIntegration,
      authorizer: fanJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/fans/me',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: fanProfilePatchIntegration,
      authorizer: fanJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/fans/me/avatar',
      methods: [apigwv2.HttpMethod.POST],
      integration: fanAvatarPostIntegration,
      authorizer: fanJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/giphy/search',
      methods: [apigwv2.HttpMethod.GET],
      integration: giphySearchIntegration,
      authorizer: fanJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/admin/session',
      methods: [apigwv2.HttpMethod.GET],
      integration: adminSessionGetIntegration,
      authorizer: staffJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/admin/catalog',
      methods: [apigwv2.HttpMethod.GET],
      integration: adminCatalogListIntegration,
      authorizer: staffJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/admin/catalog/episodes/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: adminCatalogGetIntegration,
      authorizer: staffJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/admin/catalog/episodes/{id}',
      methods: [apigwv2.HttpMethod.POST],
      integration: adminCatalogPostIntegration,
      authorizer: staffJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/admin/catalog/episodes/{id}',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: adminCatalogPatchIntegration,
      authorizer: staffJwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/v1/admin/catalog/episodes/{id}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: adminCatalogDeleteIntegration,
      authorizer: staffJwtAuthorizer,
    });

    const httpStageL1 = this.httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (httpStageL1) {
      httpStageL1.defaultRouteSettings = {
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      };
    }

    new cdk.CfnOutput(this, 'CatalogTableName', {
      value: this.catalogTable.tableName,
      description: 'DynamoDB Catalog table — partition key `id` (episode slug).',
    });

    new cdk.CfnOutput(this, 'RoomsTableName', {
      value: this.roomsTable.tableName,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.connectionsTable.tableName,
    });

    new cdk.CfnOutput(this, 'RoomPresenceTableName', {
      value: this.roomPresenceTable.tableName,
      description: 'DynamoDB room presence table - partition key `roomId`, sort key `presenceKey`.',
    });

    new cdk.CfnOutput(this, 'FanProfilesTableName', {
      value: this.fanProfilesTable.tableName,
      description: 'DynamoDB FanProfiles — partition key `sub` (Cognito subject).',
    });

    new cdk.CfnOutput(this, 'FanAvatarsBucketName', {
      value: this.fanAvatarsBucket.bucketName,
      description: `Private S3 bucket for fan avatars (keys under \`${FAN_AVATAR_S3_KEY_PREFIX}{sub}/\`).`,
    });

    new cdk.CfnOutput(this, 'FanAvatarsPublicBaseUrl', {
      value: this.fanAvatarsPublicBaseUrl,
      description:
        'HTTPS base URL for avatar objects (append object key path; no trailing slash). Anonymous guests read via CloudFront only.',
    });

    new cdk.CfnOutput(this, 'FanAvatarsDistributionId', {
      value: this.fanAvatarsDistribution.distributionId,
      description: 'CloudFront distribution serving fan avatar objects (OAC to FanAvatarsBucket).',
    });

    new cdk.CfnOutput(this, 'FanAvatarPostFnName', {
      value: fanAvatarPostFn.functionName,
      description:
        'Avatar upload Lambda for POST /v1/fans/me/avatar (multipart file field). Env: FAN_AVATARS_*, FAN_PROFILES_TABLE_NAME.',
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description:
        'HTTP API base URL (HTTPS). Append `/v1/catalog`, `/v1/rooms`, `/v1/lobby`, `/v1/webrtc/ice`, `/v1/fans/me`, `/v1/giphy/search`, `/v1/admin/session`, `/v1/admin/catalog`, `/v1/admin/catalog/episodes/{id}` (GET/POST/PATCH/DELETE).',
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: this.httpApi.httpApiId,
    });

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: wsStage.url,
      description: 'WebSocket **`wss://`** URL.',
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
    });

    new cdk.CfnOutput(this, 'TmdbApiTokenSecretArn', {
      value: this.tmdbApiTokenSecret.secretArn,
      description: 'Set to a real TMDB bearer token (not a v3 api_key query param in git).',
    });

    new cdk.CfnOutput(this, 'GiphyApiKeySecretArn', {
      value: this.giphyApiKeySecret.secretArn,
      description: 'Set to a real Giphy API key for GET /v1/giphy/search (secret name riffsync/prod/giphy-api-key).',
    });

    new cdk.CfnOutput(this, 'GiphyRateLimitTableName', {
      value: giphyRateLimitTable.tableName,
      description: 'Per-fan Giphy search rate limit counters (TTL attribute expiresAt).',
    });

    new cdk.CfnOutput(this, 'PrivacyRemovalRoutingSecretArn', {
      value: privacyRoutingSecret.secretArn,
      description:
        'JSON with notifyEmail + SES-verified fromEmail for POST /v1/privacy-removal-request (see secret description).',
    });

    new cdk.CfnOutput(this, 'TmdbReconcileFnName', {
      value: tmdbReconcileFn.functionName,
      description: 'Invoke manually: aws lambda invoke --function-name … out.json',
    });

    new cdk.CfnOutput(this, 'StaleRoomMs', {
      value: String(staleRoomMs),
      description: '`GET /v1/lobby` excludes rows with `lastActivityAt` older than this (ms). Override: `--context staleRoomMs=…`.',
    });
  }
}
