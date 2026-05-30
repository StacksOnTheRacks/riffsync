import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import {
  fanWebAlternateDomainNamesFromContext,
  oauthAdminCallbacksForHost,
} from './context-alternate-domains';

export interface StaffAuthStackProps extends cdk.StackProps {
  /**
   * Shared SES configuration set (provisioned by {@link FanAuthStack} as **`riffsync-ses-send-prod`**).
   */
  readonly sesSendingConfigurationSetName: string;
  /**
   * Extra OAuth callback / sign-out URLs (comma-separated CDK context **`staffAuthOAuthExtras`**).
   */
  readonly extraOAuthUrls?: string[];
  /**
   * Override Cognito hosted domain prefix (must be unique per region). Default **`riffsync-staff-prod`**.
   */
  readonly cognitoDomainPrefix?: string;
}

function parseExtrasFromContext(scope: Construct): string[] {
  const raw = scope.node.tryGetContext('staffAuthOAuthExtras');
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DEFAULT_STAFF_SES_DOMAIN = 'riffsync.tv';

/**
 * Cognito invite / recovery email via Amazon SES — reuses the shared prod configuration set.
 *
 * Optional CDK context:
 * - **`staffAuthSesVerifiedDomain`** — verified SES domain (default **`riffsync.tv`**).
 * - **`staffAuthSesFromEmail`** — sender address on that domain (default **`noreply@<domain>`**).
 * - **`staffAuthSesFromName`** — display name (default **`RiffSync`**).
 * - **`staffAuthSesRegion`** — SES identity region when it differs from the stack region.
 */
function staffPoolSesEmail(
  scope: Construct,
  sesConfigurationSetName: string,
): cognito.UserPoolEmail {
  const domainRaw = scope.node.tryGetContext('staffAuthSesVerifiedDomain');
  const sesVerifiedDomain =
    typeof domainRaw === 'string' && domainRaw.trim() !== ''
      ? domainRaw.trim().toLowerCase()
      : DEFAULT_STAFF_SES_DOMAIN;

  const fromEmailRaw = scope.node.tryGetContext('staffAuthSesFromEmail');
  const fromEmail =
    typeof fromEmailRaw === 'string' && fromEmailRaw.trim() !== ''
      ? fromEmailRaw.trim().toLowerCase()
      : `noreply@${sesVerifiedDomain}`;

  const nameRaw = scope.node.tryGetContext('staffAuthSesFromName');
  const fromName =
    typeof nameRaw === 'string' && nameRaw.trim() !== '' ? nameRaw.trim() : 'RiffSync';

  const sesRegionRaw = scope.node.tryGetContext('staffAuthSesRegion');
  const sesRegion =
    typeof sesRegionRaw === 'string' && sesRegionRaw.trim() !== ''
      ? sesRegionRaw.trim()
      : undefined;

  return cognito.UserPoolEmail.withSES({
    fromEmail,
    fromName,
    sesVerifiedDomain,
    ...(sesRegion !== undefined ? { sesRegion } : {}),
    configurationSetName: sesConfigurationSetName,
  });
}

/**
 * **Staff / operator** Cognito user pool — **invite-only** Hosted UI + PKCE SPA client.
 *
 * Aligns with **`.ai/integration/authorization.md`** (separate pool for **`/v1/admin/*`**).
 */
export class StaffAuthStack extends cdk.Stack {
  public readonly staffUserPool: cognito.UserPool;
  public readonly staffUserPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: StaffAuthStackProps) {
    super(scope, id, props);

    const { cognitoDomainPrefix, sesSendingConfigurationSetName } = props;
    const contextExtras = parseExtrasFromContext(this);
    const extraOAuthUrls = [...(props.extraOAuthUrls ?? []), ...contextExtras];

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'prod');

    this.staffUserPool = new cognito.UserPool(this, 'StaffUserPool', {
      userPoolName: 'riffsync-staff-prod',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      email: staffPoolSesEmail(this, sesSendingConfigurationSetName),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    const localDevCallbackLogoutBase = [
      'http://localhost:5173/admin/auth/callback',
      'http://localhost:5173/admin/login',
      'http://127.0.0.1:5173/admin/auth/callback',
      'http://127.0.0.1:5173/admin/login',
      'http://localhost:3000/admin/auth/callback',
      'http://localhost:3000/admin/login',
      'https://localhost:5173/admin/auth/callback',
      'https://localhost:5173/admin/login',
    ];
    const prodCallbackLogoutBase = [
      ...new Set([
        ...oauthAdminCallbacksForHost('riffsync.tv'),
        ...oauthAdminCallbacksForHost('www.riffsync.tv'),
        ...fanWebAlternateDomainNamesFromContext(this).flatMap(oauthAdminCallbacksForHost),
      ]),
    ];

    const callbackUrls = [
      ...new Set([...prodCallbackLogoutBase, ...localDevCallbackLogoutBase, ...extraOAuthUrls]),
    ];

    const logoutUrls = callbackUrls;

    const domainPrefixRaw =
      typeof cognitoDomainPrefix === 'string' && cognitoDomainPrefix.trim() !== ''
        ? cognitoDomainPrefix.trim().toLowerCase()
        : (this.node.tryGetContext('staffAuthCognitoDomainPrefix') as string | undefined);
    const domainPrefix =
      typeof domainPrefixRaw === 'string' && domainPrefixRaw.trim() !== ''
        ? domainPrefixRaw.trim().toLowerCase()
        : 'riffsync-staff-prod';

    this.staffUserPool.addDomain('StaffHostedUiDomain', {
      cognitoDomain: { domainPrefix },
    });

    this.staffUserPoolClient = this.staffUserPool.addClient('StaffWebSpaClient', {
      userPoolClientName: 'riffsync-staff-web-prod',
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

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.staffUserPool.userPoolId,
      groupName: 'admin',
      description: 'Full operator access for /v1/admin/*',
    });

    new cognito.CfnUserPoolGroup(this, 'CuratorGroup', {
      userPoolId: this.staffUserPool.userPoolId,
      groupName: 'curator',
      description: 'Curated catalog / roster tools',
    });

    new cdk.CfnOutput(this, 'StaffUserPoolId', {
      value: this.staffUserPool.userPoolId,
      description: 'Staff Cognito pool id — JWT issuer for /v1/admin/* routes.',
    });

    new cdk.CfnOutput(this, 'StaffUserPoolArn', {
      value: this.staffUserPool.userPoolArn,
    });

    new cdk.CfnOutput(this, 'StaffUserPoolClientId', {
      value: this.staffUserPoolClient.userPoolClientId,
      description: 'Staff SPA / Hosted UI OAuth app client (public).',
    });

    new cdk.CfnOutput(this, 'StaffHostedUiDomainPrefix', {
      value: domainPrefix,
      description: 'Staff Cognito Hosted UI domain prefix ({prefix}.auth.<region>.amazoncognito.com).',
    });

    new cdk.CfnOutput(this, 'StaffHostedUiBaseUrl', {
      value: `https://${domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
      description: 'Staff Hosted UI base URL (append /oauth2/authorize with PKCE query params).',
    });
  }
}
