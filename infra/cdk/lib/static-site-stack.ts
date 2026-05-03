import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface StaticSiteStackProps extends cdk.StackProps {
  readonly environment: 'staging' | 'prod';
  /**
   * Public hostname for the fan SPA (e.g. staging.riffsync.tv). Requires **fanWebCertificateArn**
   * (ACM in **us-east-1**, validated for this name). If unset, only the default ***.cloudfront.net** URL is used.
   */
  readonly fanWebCustomDomain?: string;
  /**
   * ACM certificate ARN in **us-east-1** covering **fanWebCustomDomain** (CloudFront requirement).
   */
  readonly fanWebCertificateArn?: string;
  /**
   * Public Route 53 hosted zone ID for **fanWebZoneName** (optional). When set with **fanWebZoneName**,
   * creates an alias **A** record from **fanWebCustomDomain** to this distribution.
   */
  readonly fanWebHostedZoneId?: string;
  /**
   * Hosted zone name (e.g. riffsync.tv). Must match the zone for **fanWebCustomDomain** and alternate names.
   */
  readonly fanWebZoneName?: string;
  /**
   * Extra hostnames on the **same ACM certificate** as **fanWebCustomDomain** (e.g. `www.riffsync.tv`).
   * CDK context **`fanWebAlternateDomainNames`** (comma-separated). Creates CloudFront aliases + Route 53 A records.
   */
  readonly fanWebAlternateDomainNames?: string[];
}

/** Relative record name under zone, or `undefined` for zone apex. */
function recordNameUnderZone(fqdn: string, zoneName: string): string | undefined {
  const z = zoneName.replace(/\.$/, '').toLowerCase();
  const f = fqdn.replace(/\.$/, '').toLowerCase();
  if (f === z) return undefined;
  const suffix = `.${z}`;
  if (!f.endsWith(suffix)) {
    throw new Error(
      `fanWebCustomDomain (${fqdn}) must be the zone apex or a name under fanWebZoneName (${zoneName}).`,
    );
  }
  const prefix = f.slice(0, -suffix.length);
  if (prefix.includes('.')) {
    throw new Error(
      `Nested hostnames under ${zoneName} must be a single label (e.g. staging.${z}), got ${fqdn}.`,
    );
  }
  return prefix;
}

/**
 * Private S3 bucket + CloudFront with origin access control (OAC).
 * Optional **fanWebCustomDomain** + **us-east-1** ACM cert + Route 53 alias for a stable SPA URL.
 */
export class StaticSiteStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteStackProps) {
    super(scope, id, props);

    const {
      environment,
      fanWebCustomDomain,
      fanWebCertificateArn,
      fanWebHostedZoneId,
      fanWebZoneName,
      fanWebAlternateDomainNames = [],
    } = props;

    const customDomainConfigured = Boolean(fanWebCustomDomain && fanWebCertificateArn);

    const cfDomainNames =
      fanWebCustomDomain && customDomainConfigured
        ? [
            ...new Set(
              [fanWebCustomDomain.toLowerCase(), ...fanWebAlternateDomainNames.map((h) => h.toLowerCase())],
            ),
          ]
        : undefined;

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', environment);

    this.bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: environment === 'prod',
      removalPolicy:
        environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'WebOac', {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
      originAccessControlName: `riffsync-${environment}-web-oac`,
    });

    const certificate =
      customDomainConfigured && fanWebCertificateArn
        ? acm.Certificate.fromCertificateArn(this, 'WebTlsCertImported', fanWebCertificateArn)
        : undefined;

    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: `RiffSync ${environment} fan SPA`,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      domainNames: cfDomainNames,
      certificate,
      /**
       * SPA client routes: S3 has no object for `/lobby`, so CloudFront would otherwise
       * surface 403/404; map those to `index.html` so refreshes and deep links work.
       */
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(0),
        },
      ],
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
    });

    if (fanWebHostedZoneId && fanWebZoneName && cfDomainNames && cfDomainNames.length > 0) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'FanWebDnsZone', {
        hostedZoneId: fanWebHostedZoneId,
        zoneName: fanWebZoneName,
      });
      cfDomainNames.forEach((hostname, i) => {
        const recordName = recordNameUnderZone(hostname, fanWebZoneName);
        new route53.ARecord(this, `FanWebDnsAlias${i}`, {
          zone,
          recordName,
          target: route53.RecordTarget.fromAlias(
            new route53Targets.CloudFrontTarget(this.distribution),
          ),
        });
      });
    }

    const siteUrl = fanWebCustomDomain
      ? `https://${fanWebCustomDomain}`
      : `https://${this.distribution.distributionDomainName}`;

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Private S3 bucket for SPA objects (sync from CI in M2+)',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
    });
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description:
        'CloudFront default hostname (use FanWebSiteUrl when a custom domain is configured).',
    });
    new cdk.CfnOutput(this, 'FanWebSiteUrl', {
      value: siteUrl,
      description:
        'Canonical HTTPS origin for the fan SPA (custom domain or *.cloudfront.net). Use for VITE_PUBLIC_ORIGIN and CORS.',
    });
  }
}
