# Public site SEO operator runbook

Deployer-facing guide for **Search Console / Bing Webmaster verification** and the **post-deploy SEO smoke check** on production **`riffsync.tv`**. Normative capability contracts live in **`.ai/specs/public-site-seo.spec.md`**, **`.ai/operations/build_packaging.md`**, and **`.ai/operations/deployment_environments.md`**. This document covers DNS TXT verification, secret handling, the operator checklist, and smoke invocation.

**Prerequisites:** M27 (apex canonical redirect), M28 (`robots.txt` / `sitemap.xml`), and M29 (per-route head tags + prerender) are deployed to production via **`deploy-prod.yml`** phase 5 before running the smoke script or announcing SEO-ready behavior.

## 1. Hosted zone context

| Item | Value |
| --- | --- |
| **Public hostname** | **`riffsync.tv`** (apex canonical) |
| **Alternate hostname** | **`www.riffsync.tv`** (301 to apex at CloudFront) |
| **Route 53 zone** | **`fanWebZoneName`** — typically **`riffsync.tv`** when **`RIFFSYNC_ROUTE53_ZONE_NAME`** is set in GitHub Actions / CDK context |
| **CDK stack** | **`RiffSyncStatic-prod`** — creates alias **A** records for CloudFront; **does not** manage Search Console / Bing TXT records |

TXT records for search-engine verification are **manual operator steps** in the Route 53 console. They are **not** CDK-managed, not HTML file uploads, and not meta-tag verification.

## 2. Verification token storage

| Rule | Detail |
| --- | --- |
| **Never commit tokens** | Do not put TXT values in git, CDK context, GitHub Variables, or CloudFormation templates. |
| **Secret store** | Record actual TXT **values** in the team ops secret store (e.g. 1Password **RiffSync Ops**). This runbook documents **procedure and record names** only. |
| **Rotation** | When a vendor re-issues a token, update Route 53 and the secret store; no stack redeploy is required for TXT-only changes. |

## 3. Google Search Console

1. Open [Google Search Console](https://search.google.com/search-console) and add a property for **`riffsync.tv`** (domain or URL-prefix property per your org preference; DNS TXT verification works for the apex zone).
2. Choose **DNS** verification. Copy the **TXT record name** and **TXT value** from the console.
3. In **AWS Console** → **Route 53** → hosted zone **`riffsync.tv`** (or the zone matching **`fanWebZoneName`**):
   - Create a **TXT** record with the name and value Search Console provides.
   - Use a short TTL (e.g. **300** seconds) during initial verification if you want faster propagation feedback.
4. Wait for DNS propagation (minutes to hours). In Search Console, click **Verify**.
5. Record the verified property and token metadata in **RiffSync Ops** (not in git).

**Expected:** Search Console shows **Verified** for **`riffsync.tv`** after propagation.

## 4. Bing Webmaster Tools

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and add **`riffsync.tv`**.
2. Choose **DNS** / **CNAME or TXT** verification per Bing's wizard. Copy the **TXT record name** and **value**.
3. In the same Route 53 hosted zone, add a **TXT** record for Bing. If Google and Bing issue different tokens, create **one TXT record per vendor** (or combine per vendor instructions when multiple strings are allowed on one name).
4. Wait for propagation and confirm **Verified** in Bing Webmaster.
5. Store token values in **RiffSync Ops** only.

**Expected:** Bing Webmaster shows **Verified** for **`riffsync.tv`**.

## 5. Verification checklist (operator)

Complete after M27-M29 are live on production:

| Step | Done when |
| --- | --- |
| Search Console property added for **`riffsync.tv`** | Property exists in console |
| Search Console DNS TXT in Route 53 | Record visible in zone |
| Search Console **Verified** | Console status shows verified |
| Bing Webmaster property added | Property exists in console |
| Bing DNS TXT in Route 53 | Record visible in zone |
| Bing **Verified** | Console status shows verified |
| TXT values stored in ops secret store | 1Password (or equivalent) updated |
| Production smoke script passes | **`npm run smoke:production`** exits **0** (section 6) |

The smoke script does **not** assert Search Console or Bing verification status. Those rows are manual checklist items only.

## 6. Post-deploy smoke check

From the **repository root** (Node 22+ per CI):

```bash
cd /path/to/riffsync
node --check scripts/launch-readiness/smoke-production.mjs   # syntax only
npm run smoke:production                                      # live production URLs
```

**When to run:** after **`deploy-prod.yml`** completes phase 5 (S3 sync + CloudFront invalidation) and DNS points at the current distribution.

**What the script asserts:**

| # | Check |
| --- | --- |
| 1 | **`https://riffsync.tv/`** returns **200** |
| 2 | **`https://www.riffsync.tv/lobby`** returns **301** with **`Location: https://riffsync.tv/lobby`** |
| 3 | **`https://riffsync.tv/robots.txt`** and **`https://riffsync.tv/sitemap.xml`** return **200** |
| 4 | **`/`** HTML contains **`<link rel="canonical" href="https://riffsync.tv/">`** |
| 5 | **`/watch/101-the-crawling-eye`** HTML contains canonical **`https://riffsync.tv/watch/101-the-crawling-eye`** |
| 6 | Fetched home **`index.html`** body contains no **`www.riffsync.tv`** host strings |

**Expected output:** one **`OK:`** line per check, then **`Production smoke check passed.`** and exit code **0**.

**Not CI-wired:** PR CI does not call this script. Run it manually before launch review or when validating a production deploy.

## 7. Related docs

- **`infra/cdk/README.md`** — *Production smoke checks*, Route 53 / CloudFront hostname variables
- **`infra/cdk/lib/static-site-stack.ts`** — **`fanWebZoneName`**, canonical redirect context
- **`.ai/operations/deployment_environments.md`** — *Public site SEO deployment readiness*
- **`.ai/operations/build_packaging.md`** — *Decisions (M31 — Search Console verification and release smoke — #328)*
