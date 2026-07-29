import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

import { dnsRecordConstructSuffix, viewerRequestRedirectToCanonicalSource } from './cloudfront-canonical-redirect';

export interface StaticSiteStackProps extends cdk.StackProps {
  /**
   * Public hostname for the fan SPA (e.g. riffsync.tv). Requires **fanWebCertificateArn**
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
  /**
   * If set (e.g. `riffsync.tv`), CloudFront returns **301** for any other custom alias so the browser
   * lands on this host (path + query preserved). Must be one of **fanWebCustomDomain** + **fanWebAlternateDomainNames**.
   * Leave unset for no host-based redirects.
   */
  readonly fanWebCanonicalHostname?: string;
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
      fanWebCustomDomain,
      fanWebCertificateArn,
      fanWebHostedZoneId,
      fanWebZoneName,
      fanWebAlternateDomainNames = [],
      fanWebCanonicalHostname: fanWebCanonicalHostnameRaw,
    } = props;

    const customDomainConfigured = Boolean(fanWebCustomDomain && fanWebCertificateArn);

    const fanWebCanonicalHostname =
      typeof fanWebCanonicalHostnameRaw === 'string' && fanWebCanonicalHostnameRaw.trim() !== ''
        ? fanWebCanonicalHostnameRaw.trim().replace(/\.$/, '').toLowerCase()
        : undefined;

    const cfDomainNames =
      fanWebCustomDomain && customDomainConfigured
        ? [
            ...new Set(
              [fanWebCustomDomain.toLowerCase(), ...fanWebAlternateDomainNames.map((h) => h.toLowerCase())],
            ),
          ]
        : undefined;

    if (fanWebCanonicalHostname && cfDomainNames && !cfDomainNames.includes(fanWebCanonicalHostname)) {
      throw new Error(
        `fanWebCanonicalHostname (${fanWebCanonicalHostname}) must match fanWebCustomDomain or one of fanWebAlternateDomainNames (got: ${cfDomainNames.join(', ')}).`,
      );
    }

    if (customDomainConfigured && !(fanWebHostedZoneId && fanWebZoneName)) {
      cdk.Annotations.of(this).addWarningV2(
        'riffsync:fan-web-dns-not-managed',
        'Custom domain + ACM are set but fanWebHostedZoneId and fanWebZoneName are not — this stack will not create Route 53 alias records. Set RIFFSYNC_ROUTE53_HOSTED_ZONE_ID and RIFFSYNC_ROUTE53_ZONE_NAME (or --context fanWebHostedZoneId / fanWebZoneName).',
      );
    }

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', 'prod');

    this.bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'WebOac', {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
      originAccessControlName: 'riffsync-prod-web-oac',
    });

    const certificate =
      customDomainConfigured && fanWebCertificateArn
        ? acm.Certificate.fromCertificateArn(this, 'WebTlsCertImported', fanWebCertificateArn)
        : undefined;

    const canonicalRedirectFn =
      fanWebCanonicalHostname && customDomainConfigured
        ? new cloudfront.Function(this, 'CanonicalHostRedirect', {
            comment: `Redirect alternate aliases to https://${fanWebCanonicalHostname}/`,
            code: cloudfront.FunctionCode.fromInline(
              viewerRequestRedirectToCanonicalSource(fanWebCanonicalHostname),
            ),
            runtime: cloudfront.FunctionRuntime.JS_2_0,
          })
        : undefined;

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'WebResponseHeadersPolicy', {
      comment: 'RiffSync fan SPA security headers',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy:
            [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "script-src 'self' https://www.gstatic.com https://www.google.com https://www.youtube.com https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https: wss:",
              "media-src 'self' blob: https:",
              "frame-src https: https://www.youtube.com https://www.youtube-nocookie.com",
              "child-src https: https://www.youtube.com https://www.youtube-nocookie.com",
              "worker-src 'self' blob:",
            ].join('; '),
          override: true,
        },
        contentTypeOptions: { override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: 'RiffSync prod fan SPA',
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      domainNames: cfDomainNames,
      certificate,
      /**
       * SPA client routes: S3 has no object for `/lobby`, so CloudFront would otherwise
       * surface 403/404; map those to `spa-shell.html` (generic noindex) so ephemeral
       * deep links do not inherit home canonical metadata.
       */
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/spa-shell.html',
          ttl: cdk.Duration.minutes(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/spa-shell.html',
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
        responseHeadersPolicy,
        functionAssociations: canonicalRedirectFn
          ? [
              {
                function: canonicalRedirectFn,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ]
          : undefined,
      },
    });

    if (fanWebHostedZoneId && fanWebZoneName && cfDomainNames && cfDomainNames.length > 0) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'FanWebDnsZone', {
        hostedZoneId: fanWebHostedZoneId,
        zoneName: fanWebZoneName,
      });
      cfDomainNames.forEach((hostname) => {
        const recordName = recordNameUnderZone(hostname, fanWebZoneName);
        const idSuffix = dnsRecordConstructSuffix(hostname);
        new route53.ARecord(this, `FanWebDnsAlias${idSuffix}`, {
          zone,
          recordName,
          target: route53.RecordTarget.fromAlias(
            new route53Targets.CloudFrontTarget(this.distribution),
          ),
        });
        // Implicit dependency via AliasTarget → distribution is enough. Do not add
        // `node.addDependency(distribution)` or churn construct ids: see README § Route 53.
      });
    }

    const primaryPublicHost =
      fanWebCanonicalHostname ?? fanWebCustomDomain?.replace(/\.$/, '').toLowerCase();
    const siteUrl = primaryPublicHost
      ? `https://${primaryPublicHost}`
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
    const route53AliasCount =
      fanWebHostedZoneId && fanWebZoneName && cfDomainNames && cfDomainNames.length > 0
        ? cfDomainNames.length
        : 0;
    new cdk.CfnOutput(this, 'FanWebRoute53AliasRecordCount', {
      value: String(route53AliasCount),
      description:
        'Route 53 alias A records managed here (0 = zone id/name not passed — no DNS records from this stack).',
    });
  }
}
