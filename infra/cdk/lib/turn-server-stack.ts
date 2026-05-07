import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface TurnServerStackProps extends cdk.StackProps {
  /**
   * **`realm`** / **`server-name`** in coturn (any stable string; browsers do not receive it in ICE).
   * Default from CDK context **`turnRealm`**, else **`riffsync-turn`**.
   */
  readonly turnRealm?: string;
}

function turnRealmFromContext(scope: Construct): string {
  const raw = scope.node.tryGetContext('turnRealm');
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.trim();
  }
  return 'riffsync-turn';
}

/** One account-wide secret for both staging and prod ICE Lambdas + one coturn process. */
export const TURN_SHARED_SECRET_NAME = 'riffsync/turn-static-auth-secret';

/**
 * **Singleton** coturn stack for **staging + prod** in the **same AWS account** — one **EC2**, one **EIP**, one **Secrets Manager** secret (**`riffsync/turn-static-auth-secret`**).
 *
 * UserData installs `coturn` on **Amazon Linux 2023**, fetches the shared secret at boot, listens on **3478** + relay **49152–65535**.
 *
 * **Deploy before** **`RiffSyncApi-*`** updates on first deploy, or use **`cdk deploy --all`** so dependency order is satisfied (`ApiCatalogStack` depends on this stack).
 */
export class TurnServerStack extends cdk.Stack {
  public readonly turnSharedSecret: secretsmanager.Secret;
  /** Elastic IP address — set **`STAGING_TURN_HOST`** and **`PROD_TURN_HOST`** to this value (or DNS). */
  public readonly turnElasticIp: string;

  constructor(scope: Construct, id: string, props: TurnServerStackProps) {
    super(scope, id, props);

    const realmRaw = props.turnRealm ?? turnRealmFromContext(this);
    const safeRealm =
      realmRaw.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/^-+|-+$/g, '') || 'riffsync-turn';

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'shared');
    cdk.Tags.of(this).add('Component', 'turn-server');

    this.turnSharedSecret = new secretsmanager.Secret(this, 'TurnSharedSecret', {
      secretName: TURN_SHARED_SECRET_NAME,
      description:
        'Shared plaintext for coturn use-auth-secret + TURN REST (staging and prod ICE Lambdas; one TURN EC2).',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_WITH_TURN_STATIC_AUTH_SECRET'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const vpc = new ec2.Vpc(this, 'TurnVpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const sg = new ec2.SecurityGroup(this, 'TurnSg', {
      vpc,
      description: 'RiffSync coturn (shared) - STUN/TURN + relay range',
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(3478), 'STUN/TURN UDP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3478), 'STUN/TURN TCP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(49152, 65535), 'TURN relay TCP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udpRange(49152, 65535), 'TURN relay UDP');

    const role = new iam.Role(this, 'TurnInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'RiffSync coturn instance (shared staging+prod)',
    });
    this.turnSharedSecret.grantRead(role);

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    );

    const userData = ec2.UserData.forLinux();
    const secretArn = this.turnSharedSecret.secretArn;
    const region = this.region;

    // Coturn is not in AL2023 default repos; SPAL enables `dnf install coturn`.
    // https://docs.aws.amazon.com/linux/al2023/ug/configure-spal-repository.html
    userData.addCommands(
      'set -euxo pipefail',
      'dnf install -y spal-release',
      'dnf install -y coturn',
      `SECRET_ARN='${secretArn}'`,
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
      'systemctl enable --now coturn',
    );

    const instance = new ec2.Instance(this, 'TurnInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role,
      userData,
      associatePublicIpAddress: true,
      detailedMonitoring: false,
      sourceDestCheck: true,
    });

    const eip = new ec2.CfnEIP(this, 'TurnEip', {
      domain: 'vpc',
      tags: [
        { key: 'Name', value: 'riffsync-turn' },
        { key: 'Project', value: 'RiffSync' },
        { key: 'Environment', value: 'shared' },
      ],
    });

    new ec2.CfnEIPAssociation(this, 'TurnEipAssoc', {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    this.turnElasticIp = eip.ref;

    new cdk.CfnOutput(this, 'TurnServerElasticIp', {
      value: eip.ref,
      description:
        'Public TURN address - set STAGING_TURN_HOST and PROD_TURN_HOST (GitHub Variables) to this, or DNS pointing here.',
    });

    new cdk.CfnOutput(this, 'TurnServerInstanceId', {
      value: instance.instanceId,
    });

    new cdk.CfnOutput(this, 'TurnServerSecurityGroupId', {
      value: sg.securityGroupId,
    });

    new cdk.CfnOutput(this, 'TurnSharedSecretArn', {
      value: this.turnSharedSecret.secretArn,
      description:
        'Same ARN ICE Lambdas use - replace placeholder in Secrets Manager before relying on TURN.',
    });
  }
}
