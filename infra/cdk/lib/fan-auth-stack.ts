import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { fanWebAlternateDomainNamesFromContext, oauthCallbacksForHost } from './context-alternate-domains';

export interface FanAuthStackProps extends cdk.StackProps {
  readonly environment: 'staging' | 'prod';
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

/** Aligns with `.forge/project.json` `public_domain`; override via `--context fanAuthSesVerifiedDomain=…`. */
const DEFAULT_FAN_SES_DOMAIN = 'riffsync.tv';

/**
 * Cognito verification / recovery email via Amazon SES (`EmailSendingAccount` DEVELOPER).
 *
 * Prerequisites in AWS: SES **domain or address identity** verified in the **same Region** as the user pool.
 *
 * Optional CDK context:
 * - **`fanAuthSesVerifiedDomain`** — verified SES domain (default **`riffsync.tv`**).
 * - **`fanAuthSesFromEmail`** — sender address on that domain (default **`noreply@<domain>`**).
 * - **`fanAuthSesFromName`** — display name (default **`RiffSync`**).
 * - **`fanAuthSesRegion`** — SES identity region when it differs from the stack region.
 * - **`fanAuthSesConfigurationSet`** — SES configuration set name for Cognito-sent mail.
 */
function fanPoolSesEmail(scope: Construct): cognito.UserPoolEmail {
  const domainRaw = scope.node.tryGetContext('fanAuthSesVerifiedDomain');
  const sesVerifiedDomain =
    typeof domainRaw === 'string' && domainRaw.trim() !== ''
      ? domainRaw.trim().toLowerCase()
      : DEFAULT_FAN_SES_DOMAIN;

  const fromEmailRaw = scope.node.tryGetContext('fanAuthSesFromEmail');
  const fromEmail =
    typeof fromEmailRaw === 'string' && fromEmailRaw.trim() !== ''
      ? fromEmailRaw.trim().toLowerCase()
      : `noreply@${sesVerifiedDomain}`;

  const nameRaw = scope.node.tryGetContext('fanAuthSesFromName');
  const fromName =
    typeof nameRaw === 'string' && nameRaw.trim() !== '' ? nameRaw.trim() : 'RiffSync';

  const sesRegionRaw = scope.node.tryGetContext('fanAuthSesRegion');
  const sesRegion =
    typeof sesRegionRaw === 'string' && sesRegionRaw.trim() !== ''
      ? sesRegionRaw.trim()
      : undefined;

  const configSetRaw = scope.node.tryGetContext('fanAuthSesConfigurationSet');
  const configurationSetName =
    typeof configSetRaw === 'string' && configSetRaw.trim() !== ''
      ? configSetRaw.trim()
      : undefined;

  return cognito.UserPoolEmail.withSES({
    fromEmail,
    fromName,
    sesVerifiedDomain,
    ...(sesRegion !== undefined ? { sesRegion } : {}),
    ...(configurationSetName !== undefined ? { configurationSetName } : {}),
  });
}

/**
 * **Fan-facing** Cognito user pool — **Hosted UI** with **local** sign-up/sign-in (email + password).
 *
 * Aligns with **`.forge/integration/authorization.md`** (host JWT **`sub`** → **`hostSub`**). Staff pool stays out of scope.
 */
export class FanAuthStack extends cdk.Stack {
  public readonly fanUserPool: cognito.UserPool;
  public readonly fanUserPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: FanAuthStackProps) {
    super(scope, id, props);

    const { environment, cognitoDomainPrefix } = props;
    const contextExtras = parseExtrasFromContext(this);
    const extraOAuthUrls = [...(props.extraOAuthUrls ?? []), ...contextExtras];

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', environment);

    this.fanUserPool = new cognito.UserPool(this, 'FanUserPool', {
      userPoolName: `riffsync-fan-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Do not set `standardAttributes.email` here: CDK emits a partial `Schema` entry (no `AttributeDataType`),
      // and CloudFormation updates then fail with Cognito **Invalid AttributeDataType**. Email is implied by
      // **sign-in alias** (`UsernameAttributes`: email).
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: fanPoolSesEmail(this),
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: environment === 'prod',
    });

    const stagingCallbackLogoutBase = [
      'https://riffsync.tv/',
      'https://riffsync.tv/auth/callback',
      'https://www.riffsync.tv/',
      'https://www.riffsync.tv/auth/callback',
      'https://staging.riffsync.tv/',
      'https://staging.riffsync.tv/auth/callback',
      'https://www-staging.riffsync.tv/',
      'https://www-staging.riffsync.tv/auth/callback',
      'http://localhost:5173/',
      'http://localhost:5173/auth/callback',
      'http://127.0.0.1:5173/',
      'http://127.0.0.1:5173/auth/callback',
      'http://localhost:3000/',
      'http://localhost:3000/auth/callback',
      'https://localhost:5173/',
      'https://localhost:5173/auth/callback',
    ];
    const prodCallbackLogoutBase = [
      ...new Set([
        ...oauthCallbacksForHost('riffsync.tv'),
        ...oauthCallbacksForHost('www.riffsync.tv'),
        ...fanWebAlternateDomainNamesFromContext(this).flatMap(oauthCallbacksForHost),
      ]),
    ];

    const callbackUrls =
      environment === 'prod'
        ? [...new Set([...prodCallbackLogoutBase, ...extraOAuthUrls])]
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
        userSrp: true,
        userPassword: true,
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
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
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

    new cdk.CfnOutput(this, 'FanHostedUiBaseUrl', {
      value: `https://${domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
      description: 'Base URL for Hosted UI (**append** **`/oauth2/authorize`** with query params from docs).',
    });
  }
}
