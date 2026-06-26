import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'node:path';
import type { Construct } from 'constructs';

import { dnsRecordConstructSuffix } from './cloudfront-canonical-redirect';
import { sfuCapEnvPrintfFragments } from './sfu-env-lines';

/** One account-wide secret for ICE Lambdas + one coturn process. */
export const TURN_SHARED_SECRET_NAME = 'riffsync/turn-static-auth-secret';

/** Join JWT HMAC secret name (Lambdas read by name; secret may be created on first SFU deploy). */
export const SFU_JOIN_SECRET_NAME = 'riffsync/sfu-join-hmac-secret';

/** Admin teardown shared secret (room PATCH Lambda + SFU EC2; create in Secrets Manager before kill switch). */
export const SFU_ADMIN_SECRET_NAME = 'riffsync/sfu-admin-secret';

export const SFU_HIGH_CPU_ALARM_NAME = 'riffsync-sfu-high-cpu';
export const SFU_STATUS_CHECK_FAILED_ALARM_NAME = 'riffsync-sfu-status-check-failed';
export const TURN_HIGH_CPU_ALARM_NAME = 'riffsync-turn-high-cpu';
export const TURN_STATUS_CHECK_FAILED_ALARM_NAME = 'riffsync-turn-status-check-failed';

export interface MediaServerStackProps extends cdk.StackProps {
  /**
   * **`realm`** / **`server-name`** in coturn (any stable string; browsers do not receive it in ICE).
   * Default from CDK context **`turnRealm`**, else **`riffsync-turn`**.
   */
  readonly turnRealm?: string;
  readonly signalingHostedZone?: route53.IHostedZone;
  readonly signalingZoneName?: string;
  readonly sfuProdSignalingHostname?: string;
}

function turnRealmFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('turnRealm');
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.trim();
  }
  return 'riffsync-turn';
}

function recordNameUnderZone(fqdn: string, zoneName: string): string | undefined {
  const z = zoneName.replace(/\.$/, '').toLowerCase();
  const f = fqdn.replace(/\.$/, '').toLowerCase();
  if (f === z) return undefined;
  const suffix = `.${z}`;
  if (!f.endsWith(suffix)) {
    throw new Error(`SFU signaling hostname (${fqdn}) must be the zone apex or a name under ${zoneName}.`);
  }
  const prefix = f.slice(0, -suffix.length);
  if (prefix.includes('.')) {
    throw new Error(
      `Nested SFU hostnames under ${z} must be a single label (e.g. sfu.${z}), got ${fqdn}.`,
    );
  }
  return prefix;
}

function normalizeFqdn(host: string): string {
  return host.replace(/\.$/, '').toLowerCase();
}

function mediaMachineImageFromContext(scope: Construct, contextKey: string): ec2.IMachineImage {
  const amiId = scope.node.tryGetContext(contextKey);
  if (typeof amiId === 'string' && amiId.trim() !== '') {
    return ec2.MachineImage.genericLinux({ 'us-east-1': amiId.trim() });
  }
  return ec2.MachineImage.latestAmazonLinux2023();
}

const SFU_SYNC_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/riffsync-sfu-sync.lock
flock -n 9 || exit 0

S3_BUCKET="$(grep '^S3_BUCKET=' /etc/riffsync-sfu-sync.env | cut -d= -f2-)"
WORKDIR=/opt/riffsync-sfu
STATE_DIR=/var/lib/riffsync-sfu
STATE_FILE="$STATE_DIR/source.sha256"
mkdir -p "$WORKDIR" "$STATE_DIR"

before=""
if [ -f "$STATE_FILE" ]; then
  before="$(cat "$STATE_FILE")"
fi

aws s3 sync "s3://$S3_BUCKET/" "$WORKDIR" --delete --exclude 'node_modules/*' --exclude 'dist/*'
after="$(find "$WORKDIR" -type f -not -path "$WORKDIR/node_modules/*" -not -path "$WORKDIR/dist/*" -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"

if [ "$after" = "$before" ] && [ -d "$WORKDIR/node_modules" ] && [ -f "$WORKDIR/dist/index.js" ]; then
  exit 0
fi

cd "$WORKDIR"
npm ci
npm run build
npm prune --omit=dev
printf '%s' "$after" > "$STATE_FILE"

if systemctl is-active --quiet riffsync-sfu; then
  systemctl restart riffsync-sfu
fi`;

/**
 * **Singleton** media stack: **coturn** + **mediasoup SFU** in **one** VPC (one cross-stack boundary with **`RiffSyncApi-prod`**).
 *
 * CloudFormation stack id remains **`RiffSyncTurn`** so existing VPC and TURN resources keep the same stack.
 */
export class MediaServerStack extends cdk.Stack {
  public readonly turnSharedSecret: secretsmanager.Secret;
  public readonly turnElasticIp: string;
  public readonly sharedMediaVpc: ec2.Vpc;

  public readonly sfuJoinTokenSecret: secretsmanager.ISecret;
  public readonly sfuElasticIp: string;
  public readonly sfuCodeBucket: s3.IBucket;
  public readonly defaultSignalingWsUrl: string;
  /** EC2 instance id for CloudWatch dashboard / alarms. */
  public readonly sfuInstanceId: string;
  /** EC2 instance id for CloudWatch dashboard / alarms. */
  public readonly turnInstanceId: string;

  constructor(scope: Construct, id: string, props: MediaServerStackProps) {
    const {
      turnRealm: turnRealmProp,
      signalingHostedZone,
      signalingZoneName,
      sfuProdSignalingHostname: prodHostRaw,
      ...stackProps
    } = props;

    const prodHost = prodHostRaw?.trim();
    if ((signalingHostedZone || signalingZoneName?.trim()) && !(prodHost && signalingHostedZone && signalingZoneName?.trim())) {
      throw new Error(
        'signalingHostedZone / signalingZoneName must be paired with sfuProdSignalingHostname.',
      );
    }
    const zName = signalingZoneName?.trim() ?? '';

    super(scope, id, {
      description:
        'RiffSync media: coturn TURN + mediasoup SFU (one VPC, two EC2, two EIPs) — turn + SFU join secrets',
      ...stackProps,
    });

    const realmRaw = turnRealmProp ?? turnRealmFromContext(this);
    const safeRealm =
      realmRaw.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/^-+|-+$/g, '') || 'riffsync-turn';

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'shared');
    cdk.Tags.of(this).add('Component', 'media-server');

    // --- TURN (coturn) ---
    this.turnSharedSecret = new secretsmanager.Secret(this, 'TurnSharedSecret', {
      secretName: TURN_SHARED_SECRET_NAME,
      description:
        'Shared plaintext for coturn use-auth-secret + TURN REST (ICE Lambdas; one TURN EC2).',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_WITH_TURN_STATIC_AUTH_SECRET'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const vpc = new ec2.Vpc(this, 'TurnVpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });
    this.sharedMediaVpc = vpc;

    const turnSg = new ec2.SecurityGroup(this, 'TurnSg', {
      vpc,
      description: 'RiffSync coturn (shared) - STUN/TURN + relay range',
      allowAllOutbound: true,
    });
    turnSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(3478), 'STUN/TURN UDP');
    turnSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3478), 'STUN/TURN TCP');
    // TURN-over-TCP/443 fallback for networks that block UDP and non-standard TCP ports.
    // coturn keeps listening on 3478; inbound 443/TCP is redirected to 3478 in UserData.
    turnSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'TURN TCP 443 fallback (redirected to 3478)');
    turnSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(49152, 65535), 'TURN relay TCP');
    turnSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udpRange(49152, 65535), 'TURN relay UDP');

    const turnRole = new iam.Role(this, 'TurnInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'RiffSync coturn instance (account singleton)',
    });
    this.turnSharedSecret.grantRead(turnRole);
    turnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    const turnUserData = ec2.UserData.forLinux();
    const turnSecretArn = this.turnSharedSecret.secretArn;
    const region = this.region;
    turnUserData.addCommands(
      'set -euxo pipefail',
      'dnf install -y spal-release',
      'dnf install -y coturn',
      `SECRET_ARN='${turnSecretArn}'`,
      `AWS_REGION='${region}'`,
      `REALM='${safeRealm}'`,
      'SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --region "$AWS_REGION" --query SecretString --output text | tr -d \'\\n\\r\')',
      'TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)',
      'install -d -m 0755 /etc/coturn',
      'printf %s "$SECRET" > /tmp/riffsync-turn-secret.txt',
      'chmod 0600 /tmp/riffsync-turn-secret.txt',
      '{',
      '  echo "listening-port=3478"',
      '  echo "listening-ip=0.0.0.0"',
      '  echo "fingerprint"',
      '  echo "use-auth-secret"',
      '  echo -n "static-auth-secret="',
      '  cat /tmp/riffsync-turn-secret.txt',
      '  echo',
      '  echo "realm=$REALM"',
      '  echo "server-name=$REALM"',
      '  echo "external-ip=$PUBLIC_IP"',
      '  echo "min-port=49152"',
      '  echo "max-port=65535"',
      '  echo "verbose"',
      '  echo "no-cli"',
      '} > /etc/coturn/turnserver.conf',
      'rm -f /tmp/riffsync-turn-secret.txt',
      // Serve the advertised turn:<host>:443?transport=tcp fallback without a TLS cert by
      // redirecting inbound 443/TCP to coturn's 3478 listener. Persisted via a boot unit so
      // it survives reboots (UserData runs only once).
      'dnf install -y iptables iptables-services',
      "cat > /etc/systemd/system/riffsync-turn-redirect.service <<'UNIT'",
      '[Unit]',
      'Description=RiffSync TURN 443->3478 TCP redirect',
      'After=network-online.target',
      'Wants=network-online.target',
      '[Service]',
      'Type=oneshot',
      'RemainAfterExit=yes',
      'ExecStart=/usr/sbin/iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-ports 3478',
      'ExecStop=/usr/sbin/iptables -t nat -D PREROUTING -p tcp --dport 443 -j REDIRECT --to-ports 3478',
      '[Install]',
      'WantedBy=multi-user.target',
      'UNIT',
      'systemctl daemon-reload',
      'systemctl enable --now riffsync-turn-redirect.service',
      'systemctl enable --now coturn',
    );

    const turnMachineImage = mediaMachineImageFromContext(this, 'turnAmiId');

    const turnInstance = new ec2.Instance(this, 'TurnInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: turnMachineImage,
      securityGroup: turnSg,
      role: turnRole,
      userData: turnUserData,
      // Keep the singleton TURN backend stable during routine CDK deploys. Operational changes
      // should be rolled with SSM or an explicit replacement window, not by every UserData edit.
      userDataCausesReplacement: false,
      associatePublicIpAddress: true,
      detailedMonitoring: false,
      sourceDestCheck: true,
    });
    const turnCfnInstance = turnInstance.node.defaultChild as ec2.CfnInstance;
    turnCfnInstance.overrideLogicalId('TurnInstanceAE0C2A657f750e8998ba6d12');
    this.turnInstanceId = turnInstance.instanceId;

    new cloudwatch.Alarm(this, 'TurnHighCpuAlarm', {
      alarmName: TURN_HIGH_CPU_ALARM_NAME,
      alarmDescription:
        'TURN EC2 CPU > 80% for 5 minutes - optional maintainer alert (no SNS in OSS default).',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          InstanceId: turnInstance.instanceId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 80,
      evaluationPeriods: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'TurnStatusCheckFailedAlarm', {
      alarmName: TURN_STATUS_CHECK_FAILED_ALARM_NAME,
      alarmDescription:
        'TURN EC2 StatusCheckFailed >= 1 for 2 minutes - optional maintainer alert (no SNS in OSS default).',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed',
        dimensionsMap: {
          InstanceId: turnInstance.instanceId,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const turnEip = new ec2.CfnEIP(this, 'TurnEip', {
      domain: 'vpc',
      tags: [
        { key: 'Name', value: 'riffsync-turn' },
        { key: 'Project', value: 'RiffSync' },
        { key: 'Environment', value: 'shared' },
      ],
    });
    new ec2.CfnEIPAssociation(this, 'TurnEipAssoc', {
      allocationId: turnEip.attrAllocationId,
      instanceId: turnInstance.instanceId,
    });
    this.turnElasticIp = turnEip.ref;

    new cdk.CfnOutput(this, 'TurnServerElasticIp', {
      value: turnEip.ref,
      description:
        'Public TURN address - set PROD_TURN_HOST (GitHub Variables) to this, or DNS pointing here.',
    });
    new cdk.CfnOutput(this, 'TurnServerInstanceId', { value: turnInstance.instanceId });
    new cdk.CfnOutput(this, 'TurnServerSecurityGroupId', { value: turnSg.securityGroupId });
    new cdk.CfnOutput(this, 'TurnSharedSecretArn', {
      value: this.turnSharedSecret.secretArn,
      description:
        'Same ARN ICE Lambdas use - replace placeholder in Secrets Manager before relying on TURN.',
    });

    // --- SFU (mediasoup) ---
    this.sfuJoinTokenSecret = secretsmanager.Secret.fromSecretNameV2(this, 'SfuJoinHmacSecret', SFU_JOIN_SECRET_NAME);
    secretsmanager.Secret.fromSecretNameV2(this, 'SfuAdminSecret', SFU_ADMIN_SECRET_NAME);

    const codeBucket = new s3.Bucket(this, 'SfuCodeBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
    this.sfuCodeBucket = codeBucket;

    const codeDeploy = new s3deploy.BucketDeployment(this, 'SfuCodeDeploy', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../../services/riffsync-sfu'), {
          exclude: ['node_modules'],
        }),
      ],
      destinationBucket: codeBucket,
      prune: true,
      memoryLimit: 1024,
    });

    const rtcMin = 40_000;
    const rtcMax = 40_199;
    const tlsEnabled = Boolean(prodHost && signalingHostedZone && zName);

    const sfuSg = new ec2.SecurityGroup(this, 'SfuSg', {
      vpc,
      description: 'RiffSync mediasoup: signaling TCP and RTC UDP/TCP port range',
      allowAllOutbound: true,
    });
    if (tlsEnabled) {
      sfuSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Caddy HTTP for ACME / port 80');
      sfuSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'WSS (Caddy HTTPS)');
    } else {
      sfuSg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(3000),
        'SFU HTTP health + WebSocket signaling',
      );
    }
    sfuSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(rtcMin, rtcMax), 'mediasoup RTC TCP');
    sfuSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udpRange(rtcMin, rtcMax), 'mediasoup RTC UDP');

    const sfuRole = new iam.Role(this, 'SfuInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'RiffSync SFU instance role for S3 code bundle and join secret read',
    });
    /**
     * Secret id **`riffsync/sfu-join-hmac-secret`** contains **`/`**. IAM **`Resource`** wildcards after
     * **`secret:`** often do not match those ARNs the same way as simple names, so **`GetSecretValue`** is
     * denied despite **`...secret*`** patterns. Scope by **`secretsmanager:SecretId`** (request value) instead.
     */
    sfuRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: ['*'],
        conditions: {
          StringLike: {
            'secretsmanager:SecretId': [`*${SFU_JOIN_SECRET_NAME}*`, `*${SFU_ADMIN_SECRET_NAME}*`],
          },
        },
      }),
    );
    sfuRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: [
          `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:alias/aws/secretsmanager`,
        ],
      }),
    );
    codeBucket.grantRead(sfuRole);
    sfuRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    const bucketName = codeBucket.bucketName;
    const prodFqForCaddy = prodHost && tlsEnabled ? normalizeFqdn(prodHost) : '';
    const siteNamesForCaddy = tlsEnabled && prodFqForCaddy ? prodFqForCaddy : '';

    const sfuUserData = ec2.UserData.forLinux();
    sfuUserData.addCommands(
      'set -euxo pipefail',
      'dnf install -y gcc-c++ make python3 python3-pip',
      'curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -',
      'dnf install -y nodejs awscli',
      `SFU_JOIN_SECRET_ID='${SFU_JOIN_SECRET_NAME}'`,
      `SFU_ADMIN_SECRET_ID='${SFU_ADMIN_SECRET_NAME}'`,
      `AWS_REGION='${region}'`,
      `S3_BUCKET='${bucketName}'`,
      `RTC_MIN='${rtcMin}'`,
      `RTC_MAX='${rtcMax}'`,
      'install -d -m 0755 /opt/riffsync-sfu',
      'SECRET=$(aws secretsmanager get-secret-value --secret-id "$SFU_JOIN_SECRET_ID" --region "$AWS_REGION" --query=SecretString --output text | tr -d \'\\n\\r\')',
      'ADMIN_SECRET=$(aws secretsmanager get-secret-value --secret-id "$SFU_ADMIN_SECRET_ID" --region "$AWS_REGION" --query=SecretString --output text | tr -d \'\\n\\r\')',
      'TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)',
      `printf "%s\\n" "SFU_JWT_SECRET=$SECRET" "SFU_ADMIN_SECRET=$ADMIN_SECRET" "PORT=3000" "MEDIASOUP_ANNOUNCED_IP=$PUBLIC_IP" "MEDIASOUP_RTC_MIN_PORT=$RTC_MIN" "MEDIASOUP_RTC_MAX_PORT=$RTC_MAX" ${sfuCapEnvPrintfFragments().join(' ')} > /etc/riffsync-sfu.env`,
      'chmod 0600 /etc/riffsync-sfu.env',
      'aws s3 sync "s3://$S3_BUCKET/" /opt/riffsync-sfu --delete',
      'cd /opt/riffsync-sfu && npm ci && npm run build && npm prune --omit=dev',
      `cat > /etc/systemd/system/riffsync-sfu.service << 'EOUNIT'
[Unit]
Description=RiffSync mediasoup SFU
After=network-online.target
[Service]
Type=simple
EnvironmentFile=/etc/riffsync-sfu.env
WorkingDirectory=/opt/riffsync-sfu
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOUNIT`,
      'systemctl daemon-reload',
      'systemctl enable --now riffsync-sfu',
    );

    if (tlsEnabled && siteNamesForCaddy) {
      sfuUserData.addCommands(
        'CADDY_VER=2.8.4',
        'curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VER}/caddy_${CADDY_VER}_linux_amd64.tar.gz" | tar xz -C /usr/local/bin caddy',
        'chmod +x /usr/local/bin/caddy',
        'install -d -m 0755 /etc/caddy',
        `cat > /etc/caddy/Caddyfile << 'CADDYEOF'
${siteNamesForCaddy} {
  reverse_proxy 127.0.0.1:3000
}
CADDYEOF`,
        `cat > /etc/systemd/system/caddy.service << 'SVCEOF'
[Unit]
Description=Caddy (SFU signaling TLS)
After=network-online.target riffsync-sfu.service
Wants=riffsync-sfu.service

[Service]
Type=simple
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF`,
        'systemctl daemon-reload',
        'systemctl enable --now caddy',
      );
    }

    const sfuInstance = new ec2.Instance(this, 'MediasoupSfuHost', {
      machineImage: mediaMachineImageFromContext(this, 'sfuAmiId'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType('t3.medium'),
      securityGroup: sfuSg,
      role: sfuRole,
      userData: sfuUserData,
      userDataCausesReplacement: false,
      associatePublicIpAddress: true,
      detailedMonitoring: false,
      sourceDestCheck: true,
    });
    sfuInstance.node.addDependency(codeDeploy);
    this.sfuInstanceId = sfuInstance.instanceId;

    const installSfuSyncTimerCommands = [
      'set -euxo pipefail',
      'install -d -m 0755 /opt/riffsync-sfu',
      `cat > /usr/local/bin/riffsync-sfu-sync.sh << 'SYNCEOF'\n${SFU_SYNC_SCRIPT}\nSYNCEOF`,
      'chmod 0755 /usr/local/bin/riffsync-sfu-sync.sh',
      `printf "%s\\n" "S3_BUCKET=${bucketName}" > /etc/riffsync-sfu-sync.env`,
      `cat > /etc/systemd/system/riffsync-sfu-sync.service << 'SYNCUNIT'
[Unit]
Description=Sync and rebuild RiffSync SFU from S3
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/riffsync-sfu-sync.sh
SYNCUNIT`,
      `cat > /etc/systemd/system/riffsync-sfu-sync.timer << 'TIMEREOF'
[Unit]
Description=Poll RiffSync SFU S3 deployment bundle

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
Unit=riffsync-sfu-sync.service

[Install]
WantedBy=timers.target
TIMEREOF`,
      'systemctl daemon-reload',
      'systemctl enable --now riffsync-sfu-sync.timer',
      'systemctl start riffsync-sfu-sync.service',
    ];
    const installSfuSyncTimer = new ssm.CfnAssociation(this, 'InstallSfuSyncTimer', {
      name: 'AWS-RunShellScript',
      targets: [
        {
          key: 'InstanceIds',
          values: [sfuInstance.instanceId],
        },
      ],
      parameters: {
        commands: installSfuSyncTimerCommands,
      },
    });
    installSfuSyncTimer.node.addDependency(codeDeploy);
    installSfuSyncTimer.node.addDependency(sfuInstance);

    new cloudwatch.Alarm(this, 'SfuHighCpuAlarm', {
      alarmName: SFU_HIGH_CPU_ALARM_NAME,
      alarmDescription:
        'SFU EC2 CPU > 80% for 5 minutes — optional maintainer alert (no SNS in OSS default).',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          InstanceId: sfuInstance.instanceId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 80,
      evaluationPeriods: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'SfuStatusCheckFailedAlarm', {
      alarmName: SFU_STATUS_CHECK_FAILED_ALARM_NAME,
      alarmDescription:
        'SFU EC2 StatusCheckFailed >= 1 for 2 minutes — optional maintainer alert (no SNS in OSS default).',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed',
        dimensionsMap: {
          InstanceId: sfuInstance.instanceId,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const sfuEip = new ec2.CfnEIP(this, 'SfuEip', {
      domain: 'vpc',
      tags: [
        { key: 'Name', value: 'riffsync-sfu' },
        { key: 'Project', value: 'RiffSync' },
        { key: 'Environment', value: 'shared' },
      ],
    });
    new ec2.CfnEIPAssociation(this, 'SfuEipAssoc', {
      allocationId: sfuEip.attrAllocationId,
      instanceId: sfuInstance.instanceId,
    });
    this.sfuElasticIp = sfuEip.ref;

    const ipFallbackWs = `ws://${sfuEip.ref}:3000`;
    if (tlsEnabled && prodHost && signalingHostedZone) {
      const prodFq = normalizeFqdn(prodHost);
      recordNameUnderZone(prodFq, zName);
      new route53.ARecord(this, `SfuSigA${dnsRecordConstructSuffix(prodFq)}`, {
        zone: signalingHostedZone,
        recordName: recordNameUnderZone(prodFq, zName),
        target: route53.RecordTarget.fromIpAddresses(sfuEip.ref),
        ttl: cdk.Duration.minutes(5),
      });
      this.defaultSignalingWsUrl = `wss://${prodFq}`;
    } else {
      this.defaultSignalingWsUrl = ipFallbackWs;
    }

    new cdk.CfnOutput(this, 'SfuElasticIp', {
      value: sfuEip.ref,
      description:
        'SFU public IP for RTC; signaling uses WSS via Caddy when sfuProdSignalingHostname is set.',
    });
    new cdk.CfnOutput(this, 'SfuJoinSecretArn', { value: this.sfuJoinTokenSecret.secretArn });
    new cdk.CfnOutput(this, 'SfuCodeBucketName', { value: codeBucket.bucketName });
    new cdk.CfnOutput(this, 'SfuDefaultSignalingWsUrl', {
      value: this.defaultSignalingWsUrl,
      description: 'Use for PROD_SFU_PUBLIC_WS_URL when token default should match CDK.',
    });
  }
}
