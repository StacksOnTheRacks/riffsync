import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { StaticSiteStack } from './static-site-stack';

describe('StaticSiteStack', () => {
  it('attaches a CSP response headers policy for Cast sender, receiver media, and fonts', () => {
    const app = new cdk.App();
    const stack = new StaticSiteStack(app, 'StaticSiteStackTest', {});
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp('script-src .*https://www\\.gstatic\\.com'),
          },
        },
      },
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp('script-src .*https://www\\.google\\.com'),
          },
        },
      },
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp('script-src .*https://www\\.youtube\\.com'),
          },
        },
      },
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp('frame-src .*https://www\\.youtube\\.com .*https://www\\.youtube-nocookie\\.com'),
          },
        },
      },
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp('font-src .*https://fonts\\.gstatic\\.com'),
          },
        },
      },
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp('style-src .*https://fonts\\.googleapis\\.com'),
          },
        },
      },
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: {
          ResponseHeadersPolicyId: {
            Ref: Match.stringLikeRegexp('WebResponseHeadersPolicy'),
          },
        },
      },
    });

    expect(template.toJSON()).toBeTruthy();
  });
});
