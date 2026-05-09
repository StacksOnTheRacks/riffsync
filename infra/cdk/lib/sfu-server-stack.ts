import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as path from 'node:path';
import type { Construct } from 'constructs';

/** Same secret name pattern as turn: one shared secret per account (staging + prod APIs). */
export const SFU_JOIN_SECRET_NAME = 'riffsync/sfu-join-hmac-secret';

/**
 * Shared-account **mediasoup** SFU — EC2 + EIP + deployment bundle in S3 (see **BucketDeployment**).
 * Signaling **ws://instance:3000/?token=…** (use TLS terminator in front for HTTPS SPAs).
 */
export class SfuServerStack extends cdk.Stack {
  public readonly sfuJoinTokenSecret: secretsmanager.Secret;
  public readonly sfuElasticIp: string;
  public readonly sfuCodeBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      description:
        'RiffSync mediasoup SFU (shared staging+prod) - EC2 + EIP; secret riffsync/sfu-join-hmac-secret',
      ...props,
    });

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'shared');
    cdk.Tags.of(this).add('Component', 'sfu-server');

    this.sfuJoinTokenSecret = new secretsmanager.Secret(this, 'SfuJoinHmacSecret', {
      secretName: SFU_JOIN_SECRET_NAME,
      description:
        'HMAC secret for short-lived SFU join JWTs (staging+prod Lambdas sign; SFU verifies).',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_WITH_SFU_JOIN_HMAC_SECRET'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

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

    const vpc = new ec2.Vpc(this, 'SfuVpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const rtcMin = 40_000;
    const rtcMax = 40_199;
    const sg = new ec2.SecurityGroup(this, 'SfuSg', {
      vpc,
      description: 'RiffSync mediasoup: signaling TCP and RTC UDP/TCP port range',
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000), 'SFU HTTP health + WebSocket signaling');
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

    const instance = new ec2.Instance(this, 'SfuInstance', {
      vpc,
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

    new cdk.CfnOutput(this, 'SfuElasticIp', {
      value: eip.ref,
      description:
        'SFU public IP (ws). Token query on signaling port; MEDIASOUP_ANNOUNCED_IP set in UserData.',
    });
    new cdk.CfnOutput(this, 'SfuJoinSecretArn', {
      value: this.sfuJoinTokenSecret.secretArn,
    });
    new cdk.CfnOutput(this, 'SfuCodeBucketName', {
      value: codeBucket.bucketName,
    });
  }
}
