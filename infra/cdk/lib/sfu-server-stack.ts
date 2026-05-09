import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import type { Construct } from 'constructs';

import { dnsRecordConstructSuffix } from './cloudfront-canonical-redirect';

/** Same secret name pattern as turn: one shared secret per account (API Lambdas). */
export const SFU_JOIN_SECRET_NAME = 'riffsync/sfu-join-hmac-secret';

export interface SfuServerStackProps extends cdk.StackProps {
  /** VPC from **`TurnServerStack`** — one VPC for TURN + SFU (account VPC default limit). */
  readonly sharedMediaVpc: ec2.IVpc;
  /**
   * Route 53 zone (import) for **`A`** records to the SFU EIP. Required together with
   * **`sfuProdSignalingHostname`** / zone name when enabling **`wss://`** (Caddy on the instance).
   */
  readonly signalingHostedZone?: route53.IHostedZone;
  /** Zone name matching **`signalingHostedZone`** (e.g. **`riffsync.tv`**). */
  readonly signalingZoneName?: string;
  /**
   * Primary FQDN for mediasoup signaling (**`wss://`**), e.g. **`sfu.riffsync.tv`**.
   * Creates Route 53 **`A`** to the SFU EIP and UserData **Caddy** (Let's Encrypt) → **`127.0.0.1:3000`**.
   */
  readonly sfuProdSignalingHostname?: string;
}

/** Relative record name under zone, or **`undefined`** for zone apex. */
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

/**
 * Account **mediasoup** SFU — EC2 + EIP + optional **Caddy `wss://`** on hostnames (**Route 53 `A` → EIP**).
 */
export class SfuServerStack extends cdk.Stack {
  /** Pre-existing account secret **`riffsync/sfu-join-hmac-secret`** (not created by this stack). */
  public readonly sfuJoinTokenSecret: secretsmanager.ISecret;
  public readonly sfuElasticIp: string;
  public readonly sfuCodeBucket: s3.IBucket;
  /** Default token / client signaling URL (`wss://` when signaling hostname is set; else `ws://EIP:3000`). */
  public readonly defaultSignalingWsUrl: string;

  constructor(scope: Construct, id: string, props: SfuServerStackProps) {
    const {
      sharedMediaVpc,
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
        'RiffSync mediasoup SFU (account singleton) - EC2 + EIP in Turn VPC; secret riffsync/sfu-join-hmac-secret',
      ...stackProps,
    });

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'shared');
    cdk.Tags.of(this).add('Component', 'sfu-server');

    this.sfuJoinTokenSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'SfuJoinHmacSecret',
      SFU_JOIN_SECRET_NAME,
    );

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

    const sg = new ec2.SecurityGroup(this, 'SfuSg', {
      vpc: sharedMediaVpc,
      description: 'RiffSync mediasoup: signaling TCP and RTC UDP/TCP port range',
      allowAllOutbound: true,
    });
    if (tlsEnabled) {
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Caddy HTTP for ACME / port 80');
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'WSS (Caddy HTTPS)');
    } else {
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000), 'SFU HTTP health + WebSocket signaling');
    }
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(rtcMin, rtcMax), 'mediasoup RTC TCP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udpRange(rtcMin, rtcMax), 'mediasoup RTC UDP');

    const role = new iam.Role(this, 'SfuInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'RiffSync SFU instance role for S3 code bundle and join secret read',
    });
    this.sfuJoinTokenSecret.grantRead(role);
    codeBucket.grantRead(role);
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    const region = this.region;
    const secretArn = this.sfuJoinTokenSecret.secretArn;
    const bucketName = codeBucket.bucketName;

    const prodFqForCaddy = prodHost && tlsEnabled ? normalizeFqdn(prodHost) : '';
    const siteNamesForCaddy = tlsEnabled && prodFqForCaddy ? prodFqForCaddy : '';

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'dnf install -y gcc-c++ make python3 py3-pip',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'dnf install -y nodejs awscli',
      `SECRET_ARN='${secretArn}'`,
      `AWS_REGION='${region}'`,
      `S3_BUCKET='${bucketName}'`,
      `RTC_MIN='${rtcMin}'`,
      `RTC_MAX='${rtcMax}'`,
      'install -d -m 0755 /opt/riffsync-sfu',
      'SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --region "$AWS_REGION" --query SecretString --output text | tr -d \'\\n\\r\')',
      'TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)',
      'printf "%s\\n" "SFU_JWT_SECRET=$SECRET" "PORT=3000" "MEDIASOUP_ANNOUNCED_IP=$PUBLIC_IP" "MEDIASOUP_RTC_MIN_PORT=$RTC_MIN" "MEDIASOUP_RTC_MAX_PORT=$RTC_MAX" > /etc/riffsync-sfu.env',
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
      userData.addCommands(
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

    /** Distinct logical ID so a manually terminated instance does not leave a dead `AWS::EC2::Instance` ref. */
    const instance = new ec2.Instance(this, 'MediasoupSfuHost', {
      vpc: sharedMediaVpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType('t3.medium'),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role,
      userData,
      associatePublicIpAddress: true,
      detailedMonitoring: false,
      sourceDestCheck: true,
    });

    instance.node.addDependency(codeDeploy);

    const eip = new ec2.CfnEIP(this, 'SfuEip', {
      domain: 'vpc',
      tags: [
        { key: 'Name', value: 'riffsync-sfu' },
        { key: 'Project', value: 'RiffSync' },
        { key: 'Environment', value: 'shared' },
      ],
    });

    new ec2.CfnEIPAssociation(this, 'SfuEipAssoc', {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    this.sfuElasticIp = eip.ref;

    const ipFallbackWs = `ws://${eip.ref}:3000`;

    if (tlsEnabled && prodHost && signalingHostedZone) {
      const prodFq = normalizeFqdn(prodHost);
      recordNameUnderZone(prodFq, zName);

      new route53.ARecord(this, `SfuSigA${dnsRecordConstructSuffix(prodFq)}`, {
        zone: signalingHostedZone,
        recordName: recordNameUnderZone(prodFq, zName),
        target: route53.RecordTarget.fromIpAddresses(eip.ref),
        ttl: cdk.Duration.minutes(5),
      });

      this.defaultSignalingWsUrl = `wss://${prodFq}`;
    } else {
      this.defaultSignalingWsUrl = ipFallbackWs;
    }

    new cdk.CfnOutput(this, 'SfuElasticIp', {
      value: eip.ref,
      description:
        'SFU public IP for RTC; signaling uses WSS via Caddy when sfuProdSignalingHostname is set.',
    });
    new cdk.CfnOutput(this, 'SfuJoinSecretArn', {
      value: this.sfuJoinTokenSecret.secretArn,
    });
    new cdk.CfnOutput(this, 'SfuCodeBucketName', {
      value: codeBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'SfuDefaultSignalingWsUrl', {
      value: this.defaultSignalingWsUrl,
      description: 'Use for PROD_SFU_PUBLIC_WS_URL when token default should match CDK.',
    });
  }
}
