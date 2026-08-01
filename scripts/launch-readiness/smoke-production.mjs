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
    expectBodyIncludes: [
      '<title>RiffSync - Watch Parties</title>',
      '<link rel="canonical" href="https://riffsync.tv/">',
    ],
    expectBodyExcludes: ['<meta name="robots" content="noindex" />', 'www.riffsync.tv'],
  },
  {
    label: 'Catalog clean URL serves prerendered head tags',
    url: `${CANONICAL}/catalog`,
    expectStatus: 200,
    expectBodyIncludes: [
      '<title>RiffSync Catalog - Browse the Library</title>',
      '<link rel="canonical" href="https://riffsync.tv/catalog" />',
    ],
    expectBodyExcludes: ['<meta name="robots" content="noindex" />'],
  },
  {
    label: 'MST3K clean URL serves prerendered head tags',
    url: `${CANONICAL}/catalog/mst3k`,
    expectStatus: 200,
    expectBodyIncludes: [
      '<title>MST3K - RiffSync Catalog</title>',
      '<link rel="canonical" href="https://riffsync.tv/catalog/mst3k" />',
    ],
    expectBodyExcludes: ['<meta name="robots" content="noindex" />'],
  },
  {
    label: 'Watch fixture clean URL serves prerendered head tags',
    url: `${CANONICAL}/watch/${WATCH_FIXTURE_ID}`,
    expectStatus: 200,
    expectBodyIncludes: [
      '<title>The Crawling Eye - RiffSync</title>',
      `<link rel="canonical" href="https://riffsync.tv/watch/${WATCH_FIXTURE_ID}" />`,
    ],
    expectBodyExcludes: ['<meta name="robots" content="noindex" />'],
  },
  {
    label: 'index.html has no www.riffsync.tv hosts',
    url: `${CANONICAL}/`,
    expectStatus: 200,
    expectBodyExcludes: 'www.riffsync.tv',
  },
];

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

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

  const expectedIncludes = asArray(check.expectBodyIncludes);
  const expectedExcludes = asArray(check.expectBodyExcludes);
  if (expectedIncludes.length > 0 || expectedExcludes.length > 0) {
    const body = await response.text();
    for (const expected of expectedIncludes) {
      if (!body.includes(expected)) {
        return `${check.label}: response body did not include "${expected}"`;
      }
    }
    for (const forbidden of expectedExcludes) {
      if (body.includes(forbidden)) {
        return `${check.label}: response body contained forbidden string "${forbidden}"`;
      }
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
