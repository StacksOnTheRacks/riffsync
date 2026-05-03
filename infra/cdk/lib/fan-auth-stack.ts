import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface FanAuthStackProps extends cdk.StackProps {
  readonly environment: 'staging' | 'prod';
  /**
   * Meta (Facebook) App ID (public). CI uses a placeholder; set a real value for deploy.
   * Example: `--context facebookAppId=1234567890123456`
   */
  readonly facebookAppId?: string;
  /**
   * Extra OAuth callback / sign-out URLs (e.g. staging CloudFront `https://dxxxx.cloudfront.net/`).
   * Comma-separated in CDK context `fanAuthOAuthExtras`.
   */
  readonly extraOAuthUrls?: string[];
  /**
   * Override Cognito hosted domain prefix (must be unique per region). Default `riffsync-fan-{environment}`.
   */
  readonly cognitoDomainPrefix?: string;
}

function parseExtrasFromContext(scope: Construct): string[] {
  const raw = scope.node.tryGetContext('fanAuthOAuthExtras');
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveFacebookAppId(scope: Construct, explicit: string | undefined): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim();
  }
  const ctx = scope.node.tryGetContext('facebookAppId');
  if (typeof ctx === 'string' && ctx.trim() !== '') {
    return ctx.trim();
  }
  return '0000000000000000';
}

/**
 * **Fan-facing** Cognito user pool — **Hosted UI + Facebook federation** only (no native password sign-in).
 *
 * Aligns with **`.forge/integration/authorization.md`** (host JWT **`sub`** → **`hostSub`**). Staff pool stays out of scope.
 */
export class FanAuthStack extends cdk.Stack {
  public readonly fanUserPool: cognito.UserPool;
  public readonly fanUserPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: FanAuthStackProps) {
    super(scope, id, props);

    const { environment, facebookAppId: facebookAppIdProp, cognitoDomainPrefix } = props;
    const contextExtras = parseExtrasFromContext(this);
    const extraOAuthUrls = [...(props.extraOAuthUrls ?? []), ...contextExtras];

    const facebookAppId = resolveFacebookAppId(this, facebookAppIdProp);

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', environment);

    const facebookAppSecret = new secretsmanager.Secret(this, 'FacebookAppSecretForCognito', {
      secretName: `riffsync/${environment}/facebook-app-secret`,
      description:
        'Meta (Facebook) app secret referenced by Cognito Facebook IdP (never embed in SPA; rotate via Secrets Manager)',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_WITH_META_APP_SECRET'),
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    /** MVP:** federated Hosted UI only — **no Cognito-native password/SRP**. */
    const selfSignUpEnabled = false;

    this.fanUserPool = new cognito.UserPool(this, 'FanUserPool', {
      userPoolName: `riffsync-fan-${environment}`,
      selfSignUpEnabled,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: environment === 'prod',
      signInAliases: { email: true },
      standardAttributes: { email: { required: false, mutable: true } },
    });

    new cognito.UserPoolIdentityProviderFacebook(this, 'FacebookIdp', {
      userPool: this.fanUserPool,
      clientId: facebookAppId,
      clientSecret: facebookAppSecret.secretValue.toString(),
      scopes: ['public_profile', 'email'],
    });

    const stagingCallbackLogoutBase = [
      'https://riffsync.tv/',
      'https://riffsync.tv/callback',
      'https://staging.riffsync.tv/',
      'https://staging.riffsync.tv/callback',
      'http://localhost:5173/',
      'http://localhost:5173/callback',
      'http://127.0.0.1:5173/',
      'http://127.0.0.1:5173/callback',
      'http://localhost:3000/',
      'http://localhost:3000/callback',
      'https://localhost:5173/',
      'https://localhost:5173/callback',
    ];
    const prodCallbackLogoutBase = ['https://riffsync.tv/', 'https://riffsync.tv/callback'];

    const callbackUrls =
      environment === 'prod'
        ? [...prodCallbackLogoutBase, ...extraOAuthUrls]
        : [...new Set([...stagingCallbackLogoutBase, ...prodCallbackLogoutBase, ...extraOAuthUrls])];

    const logoutUrls = callbackUrls;

    const domainPrefixRaw =
      typeof cognitoDomainPrefix === 'string' && cognitoDomainPrefix.trim() !== ''
        ? cognitoDomainPrefix.trim().toLowerCase()
        : (this.node.tryGetContext('fanAuthCognitoDomainPrefix') as string | undefined);
    const domainPrefix =
      typeof domainPrefixRaw === 'string' && domainPrefixRaw.trim() !== ''
        ? domainPrefixRaw.trim().toLowerCase()
        : `riffsync-fan-${environment}`;

    this.fanUserPool.addDomain('FanHostedUiDomain', {
      cognitoDomain: { domainPrefix },
    });

    this.fanUserPoolClient = this.fanUserPool.addClient('FanWebSpaClient', {
      userPoolClientName: `riffsync-fan-web-${environment}`,
      generateSecret: false,
      authFlows: {
        userSrp: false,
        userPassword: false,
        adminUserPassword: false,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.FACEBOOK],
    });

    new cdk.CfnOutput(this, 'FanUserPoolId', {
      value: this.fanUserPool.userPoolId,
      description: 'Fan Cognito pool id — JWT issuer for hosts (JWT authorizer **`sub`** = **`hostSub`**).',
    });

    new cdk.CfnOutput(this, 'FanUserPoolArn', {
      value: this.fanUserPool.userPoolArn,
    });

    new cdk.CfnOutput(this, 'FanUserPoolClientId', {
      value: this.fanUserPoolClient.userPoolClientId,
      description: 'SPA / Hosted UI OAuth app client **(public)**.',
    });

    new cdk.CfnOutput(this, 'FanHostedUiDomainPrefix', {
      value: domainPrefix,
      description: 'Cognito Hosted UI domain prefix (**{prefix}.auth.<region>.amazoncognito.com**).',
    });

    new cdk.CfnOutput(this, 'FanFacebookAppSecretSecretArn', {
      value: facebookAppSecret.secretArn,
      description: 'Put Meta app **`client_secret`** here before relying on Hosted UI (**never** paste into SPA)',
    });

    new cdk.CfnOutput(this, 'FanHostedUiBaseUrl', {
      value: `https://${domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
      description: 'Base URL for Hosted UI (**append** **`/oauth2/authorize`** with query params from docs).',
    });
  }
}
