# Giphy operator runbook

Deployer-facing guide for **Giphy GIF search and chat** in hosted RiffSync. Normative API shapes live in **`.ai/integration/api_contracts.md`** (`GET /v1/giphy/search`), **`.ai/integration/external_systems.md`**, and **`docs/contracts.websocket.md`** (`chat_gif`). This document covers keys, attribution, compliance checks, and smoke tests.

## 1. Product posture (what RiffSync does / does not do)

- GIFs come **only** from the **Giphy API** via the server proxy **`GET /v1/giphy/search`**. Chat posts reference **Giphy-hosted HTTPS CDN URLs** in **`chat_gif`** WebSocket messages (see **`docs/contracts.websocket.md`**).
- **No** user-uploaded GIF files to RiffSync **S3** or DynamoDB in this slice. Clients must not send arbitrary image URLs or GIF bytes on **`chat_gif`**.
- The SPA **never** embeds a Giphy API key. Search uses the fan **Cognito JWT** only (`Authorization: Bearer …` on HTTP; fan identity on the WebSocket connection for send).
- **Guests** are **receive-only** for GIF posts. Only **signed-in fans** can search (HTTP) and send **`chat_gif`** (WebSocket).

Implementation pointers: `infra/cdk/lambda/giphy-search.ts`, `infra/cdk/lambda/giphy-search-shared.ts`, `apps/web/src/api/giphySearchApi.ts`, `apps/web/src/room/ChatGiphyPicker.tsx`.

## 2. Obtain and register a Giphy API key

1. Create a Giphy developer app and API key per [Giphy API documentation](https://developers.giphy.com/docs/api/).
2. You are responsible for your Giphy account limits, any billing Giphy applies, and compliance with the **Giphy API Terms of Service** and published brand/attribution guidelines:
   - [Giphy API Terms of Service](https://developers.giphy.com/docs/api/terms/)
   - [Giphy attribution / brand guidelines](https://developers.giphy.com/docs/#attribution) (official Giphy pages; do not treat this runbook as legal advice).

Use a key appropriate for your production traffic tier. RiffSync does not host or resell Giphy quota.

## 3. Secrets Manager (required for hosted prod)

| Item | Value |
| --- | --- |
| **Secret name** | **`riffsync/prod/giphy-api-key`** (CDK: `riffsync/${environment}/giphy-api-key` with **`environment=prod`**) |
| **Synth placeholder** | `REPLACE_WITH_GIPHY_API_KEY` — search returns **502** or **503** until replaced with a real key |
| **Accepted secret shapes** | Plain string API key, or JSON with **`apiKey`**, **`api_key`**, or **`key`** (see `parseGiphyApiKey` in `infra/cdk/lambda/giphy-search-shared.ts`) |
| **Set / rotate** | `aws secretsmanager put-secret-value --secret-id riffsync/prod/giphy-api-key --secret-string 'YOUR_KEY'` (or AWS Console). **No** key in git, committed `.env` files, SPA bundle, or CloudFormation outputs that expose the value. |
| **IAM** | Only **`GiphySearchFn`** has **`secretsmanager:GetSecretValue`** on this secret (see `infra/cdk/lib/api-catalog-stack.ts`). |

**Rotation:** update the secret value in Secrets Manager; the next search invocation reads the new value. No redeploy required for rotation alone.

## 4. Attribution and branding (operator checklist)

RiffSync implements baseline Giphy attribution in the compose UI. After each production deploy that touches chat or the picker, verify:

| Check | Where |
| --- | --- |
| **“Powered by GIPHY”** link to `https://giphy.com/` is visible whenever the GIF picker popover is open | `apps/web/src/room/ChatGiphyPicker.tsx` (`.riffsync-room-chat-giphy-attribution`) |
| Production build includes the picker shipped in [#33](https://github.com/StacksOnTheRacks/riffsync/issues/33) | Your SPA deploy (`RiffSyncStatic-prod` / CloudFront) |

**Beyond RiffSync:** logo assets, placement rules, and other brand requirements are defined by **Giphy’s published brand and attribution guidelines** (links in section 2). Re-read those docs when upgrading the Giphy integration or changing picker UX.

## 5. Technical guardrails (enforced in code)

Document these for compliance audits; details are normative in **`.ai/integration/api_contracts.md`** where noted.

| Control | Behavior |
| --- | --- |
| **Upstream rating** | Server passes fixed **`rating=pg-13`** to Giphy search (not client-selectable). |
| **Search auth** | **Fan JWT** required on **`GET /v1/giphy/search`**; **401** without a valid token. |
| **Search rate limit** | **30/min** per JWT **`sub`** (Dynamo-backed; env **`GIPHY_RATE_LIMIT_PER_MINUTE`**). |
| **Chat send** | **`chat_gif`** requires fan JWT on the WebSocket connection; **`renditionUrl`** must be HTTPS on allowlisted Giphy CDN hosts (`giphy.com`, `*.giphy.com`). |
| **Chat rate limit** | Each GIF post counts toward **20 chat actions/min per `sessionId`** (text, GIF, reactions; per **`.ai/integration/api_contracts.md`**). |
| **Logging** | Do not log raw chat bodies at INFO; do not log Giphy API keys. Align with observability work in [#36](https://github.com/StacksOnTheRacks/riffsync/issues/36) when that lands. |

**Missing or placeholder secret:** `parseGiphyApiKey` rejects values containing `REPLACE`; the handler returns **503** with `Giphy search is temporarily unavailable`. Upstream Giphy errors map to **502** or **503** without leaking key material or response bodies to clients.

## 6. Smoke test (after secret is set)

Run against **production** only when you intend to use live Giphy quota and fan traffic.

1. Deploy **`RiffSyncApi-prod`** (or full prod deploy per **`infra/cdk/README.md`**).
2. Set a real secret on **`riffsync/prod/giphy-api-key`** (section 3).
3. Sign in as a fan (Cognito Hosted UI) and obtain an access token (same flow as **`GET /v1/fans/me`**).
4. Resolve the HTTP API base URL from stack output **`HttpApiUrl`**:

```bash
export AWS_REGION=us-east-1
API_BASE="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name RiffSyncApi-prod \
  --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue" --output text)"
export TOKEN="<fan_access_jwt>"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/v1/giphy/search?q=hello&limit=5"
```

**Expected:** HTTP **200** with JSON `results[]` entries containing **`giphyId`**, **`previewUrl`**, and **`renditionUrl`** (HTTPS Giphy CDN hosts only).

5. In the room UI: open the **GIF** picker, search, post a GIF; confirm other participants see the inline GIF and the picker still shows **Powered by GIPHY**.
6. In the browser network tab (or built assets): confirm the SPA does **not** call `api.giphy.com` with an API key query param. Search traffic should go only to your **`/v1/giphy/search`** endpoint with the fan JWT.

## 7. Related documentation

| Document | Role |
| --- | --- |
| **`infra/cdk/README.md`** | Giphy secret subsection next to TMDB; deploy ordering |
| **`.ai/integration/external_systems.md`** | Giphy integration boundary |
| **`.ai/operations/security.md`** | Secrets and ephemeral chat posture |
| **`docs/contracts.websocket.md`** | **`chat_gif`** payload and auth |
