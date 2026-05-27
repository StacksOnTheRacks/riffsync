import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { fanWebAlternateDomainNamesFromContext, oauthCallbacksForHost } from './context-alternate-domains';

export interface FanAuthStackProps extends cdk.StackProps {
  /**
   * Extra OAuth callback / sign-out URLs (e.g. CloudFront default `https://dxxxx.cloudfront.net/`).
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

/** Aligns with `.ai/project.json` `public_domain`; override via `--context fanAuthSesVerifiedDomain=…`. */
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
 */
function fanPoolSesEmail(scope: Construct, sesConfigurationSetName: string): cognito.UserPoolEmail {
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

  return cognito.UserPoolEmail.withSES({
    fromEmail,
    fromName,
    sesVerifiedDomain,
    ...(sesRegion !== undefined ? { sesRegion } : {}),
    configurationSetName: sesConfigurationSetName,
  });
}

/**
 * **Fan-facing** Cognito user pool — **Hosted UI** with **local** sign-up/sign-in (email + password).
 *
 * Aligns with **`.ai/integration/authorization.md`** (host JWT **`sub`** → **`hostSub`**). Staff pool stays out of scope.
 */
export class FanAuthStack extends cdk.Stack {
  public readonly fanUserPool: cognito.UserPool;
  public readonly fanUserPoolClient: cognito.UserPoolClient;
  /** SES configuration set wired to Cognito + **`SES_CONFIGURATION_SET_NAME`** on **`PrivacyRemovalRequestFn`**. */
  public readonly sesSendingConfigurationSetName: string;

  constructor(scope: Construct, id: string, props: FanAuthStackProps) {
    super(scope, id, props);

    const { cognitoDomainPrefix } = props;
    const contextExtras = parseExtrasFromContext(this);
    const extraOAuthUrls = [...(props.extraOAuthUrls ?? []), ...contextExtras];

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'prod');

    const sesSendingTopic = new sns.Topic(this, 'SesSendingEventsTopic', {
      topicName: 'riffsync-ses-send-events-prod',
      displayName: 'RiffSync SES outbound events (prod)',
    });

    const sesSendingConfigSet = new ses.ConfigurationSet(this, 'SesSendingEventsConfigSet', {
      configurationSetName: 'riffsync-ses-send-prod',
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      reputationMetrics: true,
    });
    this.sesSendingConfigurationSetName = sesSendingConfigSet.configurationSetName;

    const sesSendingEventDestination = sesSendingConfigSet.addEventDestination('SnsReputationEvents', {
      configurationSetEventDestinationName: 'sns-reputation-events-prod',
      destination: ses.EventDestination.snsTopic(sesSendingTopic),
      events: [
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.DELIVERY,
        ses.EmailSendingEvent.REJECT,
        ses.EmailSendingEvent.RENDERING_FAILURE,
        ses.EmailSendingEvent.DELIVERY_DELAY,
      ],
    });

    this.fanUserPool = new cognito.UserPool(this, 'FanUserPool', {
      userPoolName: 'riffsync-fan-prod',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Omit `standardAttributes.email`: CDK omits `AttributeDataType` on standard attrs, which breaks Cognito updates (Invalid AttributeDataType).
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: fanPoolSesEmail(this, this.sesSendingConfigurationSetName),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    const poolCfn = this.fanUserPool.node.defaultChild as cognito.CfnUserPool;
    const evtCfn = sesSendingEventDestination.node.defaultChild;
    if (evtCfn instanceof cdk.CfnResource) {
      poolCfn.addDependency(evtCfn);
    }

    const localDevCallbackLogoutBase = [
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

    const callbackUrls = [
      ...new Set([...prodCallbackLogoutBase, ...localDevCallbackLogoutBase, ...extraOAuthUrls]),
    ];

    const logoutUrls = callbackUrls;

    const domainPrefixRaw =
      typeof cognitoDomainPrefix === 'string' && cognitoDomainPrefix.trim() !== ''
        ? cognitoDomainPrefix.trim().toLowerCase()
        : (this.node.tryGetContext('fanAuthCognitoDomainPrefix') as string | undefined);
    const domainPrefix =
      typeof domainPrefixRaw === 'string' && domainPrefixRaw.trim() !== ''
        ? domainPrefixRaw.trim().toLowerCase()
        : 'riffsync-fan-prod';

    this.fanUserPool.addDomain('FanHostedUiDomain', {
      cognitoDomain: { domainPrefix },
    });

    this.fanUserPoolClient = this.fanUserPool.addClient('FanWebSpaClient', {
      userPoolClientName: 'riffsync-fan-web-prod',
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

    new cdk.CfnOutput(this, 'SesSendingEventsTopicArn', {
      value: sesSendingTopic.topicArn,
      description:
        'SNS topic receiving SES send events (**bounce**, **complaint**, **delivery**, **reject**, …) for the prod configuration set.',
    });

    new cdk.CfnOutput(this, 'SesSendingConfigurationSetName', {
      value: this.sesSendingConfigurationSetName,
      description: 'SES configuration set wired to Cognito and **`PrivacyRemovalRequestFn`** (**`SES_CONFIGURATION_SET_NAME`**).',
    });
  }
}
