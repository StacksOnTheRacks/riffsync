import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as ses_actions from 'aws-cdk-lib/aws-ses-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';

/** Matches `.forge/project.json` `public_domain`; override with `--context sesInboundMailDomain=…`. */
const DEFAULT_MAIL_DOMAIN = 'riffsync.tv';

/** Single shared inbound pipeline — not duplicated per staging/prod app env. */
const DEFAULT_RULE_SET_NAME = 'riffsync-ses-inbound';
const DEFAULT_TOPIC_NAME = 'riffsync-ses-inbound';

export interface SesInboundStackProps extends cdk.StackProps {
  /**
   * Domain that receives inbound mail (apex or subdomain).
   * Must match or live under **`hostedZoneName`** when MX records are created.
   */
  readonly mailDomain?: string;
  /**
   * Receipt-rule recipients (SES expects domains without `@`, or full addresses).
   * Default: **`[mailDomain]`**. Omit extension via **`sesInboundRecipients`** context (comma-separated).
   */
  readonly recipients?: string[];
  /** When both set with **`mailDomain`** under this zone, CDK creates **MX → SES inbound**. */
  readonly hostedZoneId?: string;
  readonly hostedZoneName?: string;
  /**
   * Sets this rule set as the **account-wide active** inbound rule set for the Region.
   * Only **one** active rule set per Region/account.
   */
  readonly activateReceiptRuleSet?: boolean;
}

function parseRecipientsFromContext(scope: Construct): string[] | undefined {
  const raw = scope.node.tryGetContext('sesInboundRecipients');
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function mxRecordLabel(mailDomain: string, zoneName: string): string | undefined {
  const md = mailDomain.replace(/\.$/, '').toLowerCase();
  const zn = zoneName.replace(/\.$/, '').toLowerCase();
  if (md === zn) return undefined;
  const suffix = `.${zn}`;
  if (md.endsWith(suffix)) return md.slice(0, -suffix.length);
  return undefined;
}

/**
 * Whether to activate the receipt rule set via **`ses:SetActiveReceiptRuleSet`** (default **true**).
 * CloudFormation does not expose **`AWS::SES::ActiveReceiptRuleSet`** in all Regions/specs — we use **`AwsCustomResource`** instead.
 * Set **`sesInboundActivateRuleSet`** context to **`false`** or **`none`** to skip activation.
 */
export function sesInboundReceiptRulesActivated(app: cdk.App): boolean {
  const raw = app.node.tryGetContext('sesInboundActivateRuleSet');
  if (raw === undefined || raw === '') return true;
  const s = String(raw).trim().toLowerCase();
  return s !== 'false' && s !== 'none';
}

/**
 * **SES inbound (shared):** verified-domain mail hits **`ReceiptRule`** → publishes notifications (**UTF-8 payload**) to **SNS**.
 *
 * One stack per Region/account — **not** tied to staging vs prod **application** environments.
 * Synthesized from **`bin/riffsync.ts`** only when **`environment=prod`** so **`cdk synth/deploy`** staging assemblies stay unchanged.
 *
 * Prerequisites: domain verified for **receiving** in SES, DNS **MX** to **`inbound-smtp.<region>.amazonaws.com`**
 * (CDK adds MX when **`hostedZoneId` / `hostedZoneName`** align with **`mailDomain`**).
 *
 * @see https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html
 */
export class SesInboundStack extends cdk.Stack {
  public readonly inboundTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SesInboundStackProps) {
    super(scope, id, props);

    const { hostedZoneId, hostedZoneName, activateReceiptRuleSet = false } = props;

    const mailDomainRaw = props.mailDomain ?? scope.node.tryGetContext('sesInboundMailDomain');
    const mailDomain =
      typeof mailDomainRaw === 'string' && mailDomainRaw.trim() !== ''
        ? mailDomainRaw.trim().toLowerCase()
        : DEFAULT_MAIL_DOMAIN;

    const recipients =
      props.recipients ?? parseRecipientsFromContext(scope) ?? [mailDomain];

    const ruleSetNameRaw = scope.node.tryGetContext('sesInboundRuleSetName');
    const receiptRuleSetName =
      typeof ruleSetNameRaw === 'string' && ruleSetNameRaw.trim() !== ''
        ? ruleSetNameRaw.trim()
        : DEFAULT_RULE_SET_NAME;

    const mxHint = `10 inbound-smtp.${cdk.Stack.of(this).region}.amazonaws.com`;

    cdk.Tags.of(this).add('Project', 'RiffSync');

    this.inboundTopic = new sns.Topic(this, 'SesInboundNotifications', {
      topicName: DEFAULT_TOPIC_NAME,
      displayName: 'RiffSync SES inbound',
    });

    this.inboundTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowSesPublish',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.inboundTopic.topicArn],
        conditions: {
          StringEquals: { 'AWS:SourceAccount': cdk.Aws.ACCOUNT_ID },
        },
      }),
    );

    const ruleSet = new ses.ReceiptRuleSet(this, 'InboundReceiptRuleSet', {
      receiptRuleSetName,
      rules: [
        {
          receiptRuleName: 'publish-to-sns',
          recipients,
          tlsPolicy: ses.TlsPolicy.OPTIONAL,
          scanEnabled: false,
          actions: [
            new ses_actions.Sns({ topic: this.inboundTopic }),
            new ses_actions.Stop(),
          ],
        },
      ],
    });

    if (activateReceiptRuleSet) {
      const activateInbound = new cr.AwsCustomResource(this, 'ActivateInboundReceiptRuleSet', {
        onCreate: {
          service: 'SES',
          action: 'setActiveReceiptRuleSet',
          parameters: { RuleSetName: receiptRuleSetName },
          physicalResourceId: cr.PhysicalResourceId.of(
            `ses-active-ruleset:${receiptRuleSetName}`,
          ),
        },
        onUpdate: {
          service: 'SES',
          action: 'setActiveReceiptRuleSet',
          parameters: { RuleSetName: receiptRuleSetName },
          physicalResourceId: cr.PhysicalResourceId.of(
            `ses-active-ruleset:${receiptRuleSetName}`,
          ),
        },
        onDelete: {
          service: 'SES',
          action: 'setActiveReceiptRuleSet',
          parameters: {},
          physicalResourceId: cr.PhysicalResourceId.of(
            `ses-active-ruleset:${receiptRuleSetName}`,
          ),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ses:SetActiveReceiptRuleSet'],
            resources: ['*'],
          }),
        ]),
        installLatestAwsSdk: false,
      });

      const cfnRuleSet = ruleSet.node.tryFindChild('Resource') as ses.CfnReceiptRuleSet | undefined;
      if (cfnRuleSet) {
        activateInbound.node.addDependency(cfnRuleSet);
      }
      for (const child of ruleSet.node.children) {
        const cfnRule = child.node.tryFindChild('Resource');
        if (cfnRule instanceof ses.CfnReceiptRule) {
          activateInbound.node.addDependency(cfnRule);
        }
      }
    }

    if (hostedZoneId && hostedZoneName) {
      const zn = hostedZoneName.replace(/\.$/, '').toLowerCase();
      const md = mailDomain.replace(/\.$/, '').toLowerCase();
      const label = mxRecordLabel(md, zn);
      if (label !== undefined || md === zn) {
        const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'MailDnsZone', {
          hostedZoneId,
          zoneName: hostedZoneName,
        });
        const region = cdk.Stack.of(this).region;
        const mxHost = `inbound-smtp.${region}.amazonaws.com`;
        new route53.MxRecord(this, 'SesInboundMx', {
          zone,
          recordName: label,
          values: [{ priority: 10, hostName: mxHost }],
          ttl: cdk.Duration.hours(24),
        });
      } else {
        cdk.Annotations.of(this).addWarningV2(
          'SesInboundMxSkipped',
          `sesInboundMailDomain (${mailDomain}) is not under hosted zone (${hostedZoneName}); skipping MX record — add MX manually (${mxHint}).`,
        );
      }
    }

    new cdk.CfnOutput(this, 'SesInboundTopicArn', {
      value: this.inboundTopic.topicArn,
      description: 'Subscribe Lambda/SQS for SES inbound notifications (SNS wraps raw message metadata/content).',
    });

    new cdk.CfnOutput(this, 'SesInboundReceiptRuleSetName', {
      value: ruleSet.receiptRuleSetName,
      description:
        'Receipt rule set name (activated via Custom Resource calling ses:SetActiveReceiptRuleSet when activation is enabled).',
    });

    new cdk.CfnOutput(this, 'SesInboundSesMxHint', {
      value: mxHint,
      description: 'SES inbound MX target when DNS is managed outside this stack.',
    });
  }
}
