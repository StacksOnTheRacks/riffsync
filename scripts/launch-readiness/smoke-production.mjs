#!/usr/bin/env node
/**
 * Post-deploy smoke checks for riffsync.tv public site SEO (M31).
 * Run manually after M27-M29 are deployed to production.
 */
const CANONICAL = 'https://riffsync.tv';
const WWW = 'https://www.riffsync.tv';
const WATCH_FIXTURE_ID = '101-the-crawling-eye';

const CHECKS = [
  {
    label: 'Apex home returns 200',
    url: `${CANONICAL}/`,
    expectStatus: 200,
  },
  {
    label: 'www lobby redirects to apex',
    url: `${WWW}/lobby`,
    expectStatus: 301,
    expectRedirectLocation: `${CANONICAL}/lobby`,
  },
  {
    label: 'robots.txt returns 200',
    url: `${CANONICAL}/robots.txt`,
    expectStatus: 200,
  },
  {
    label: 'sitemap.xml returns 200',
    url: `${CANONICAL}/sitemap.xml`,
    expectStatus: 200,
  },
  {
    label: 'Home canonical link tag',
    url: `${CANONICAL}/`,
    expectStatus: 200,
    expectBodyIncludes: '<link rel="canonical" href="https://riffsync.tv/">',
  },
  {
    label: 'Watch fixture canonical link',
    url: `${CANONICAL}/watch/${WATCH_FIXTURE_ID}`,
    expectStatus: 200,
    expectBodyIncludes: `https://riffsync.tv/watch/${WATCH_FIXTURE_ID}`,
  },
  {
    label: 'index.html has no www.riffsync.tv hosts',
    url: `${CANONICAL}/`,
    expectStatus: 200,
    expectBodyExcludes: 'www.riffsync.tv',
  },
];

async function runCheck(check) {
  const response = await fetch(check.url, { redirect: 'manual' });
  const statuses = Array.isArray(check.expectStatus) ? check.expectStatus : [check.expectStatus];

  if (!statuses.includes(response.status)) {
    return `${check.label}: expected status ${statuses.join('|')}, got ${response.status} for ${check.url}`;
  }

  if (check.expectRedirectLocation) {
    const location = response.headers.get('location') ?? '';
    if (location !== check.expectRedirectLocation) {
      return `${check.label}: redirect location "${location}" did not equal ${check.expectRedirectLocation}`;
    }
  }

  if (check.expectBodyIncludes || check.expectBodyExcludes) {
    const body = await response.text();
    if (check.expectBodyIncludes && !body.includes(check.expectBodyIncludes)) {
      return `${check.label}: response body did not include "${check.expectBodyIncludes}"`;
    }
    if (check.expectBodyExcludes && body.includes(check.expectBodyExcludes)) {
      return `${check.label}: response body contained forbidden string "${check.expectBodyExcludes}"`;
    }
  }

  return null;
}

async function main() {
  const failures = [];

  for (const check of CHECKS) {
    try {
      const failure = await runCheck(check);
      if (failure) {
        failures.push(failure);
      } else {
        console.log(`OK: ${check.label}`);
      }
    } catch (error) {
      failures.push(`${check.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length) {
    console.error('\nProduction smoke check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nProduction smoke check passed.');
}

main();
