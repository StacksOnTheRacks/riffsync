# Operator onboarding runbook

Maintainer-facing guide for **inviting the first staff operators** into RiffSync production. Normative auth rules live in **`.ai/integration/authorization.md`** (staff pool, **`/v1/admin/*`** JWT authorizer). API shape for the session probe is in **`.ai/integration/api_contracts.md`** (`GET /v1/admin/session`). Admin UI entry is **unlisted** at **`/admin/login`** per **`.ai/interface/interaction_flow.md`**.

**MVP posture:** invite-only Cognito console (or CLI) provisioning. **No** self-service staff registration, **no** invite API, and **no** IaC bootstrap user in **`RiffSyncStaffAuth-prod`**.

## 1. Purpose & posture

- **Staff operators** authenticate against a **dedicated** Cognito user pool **`riffsync-staff-prod`**, separate from the fan pool **`riffsync-fan-prod`**.
- **`selfSignUpEnabled: false`** on the staff pool: only maintainers with AWS access can create users (**`AdminCreateUser`** or console equivalent).
- **COGNITO** is the only supported identity provider on the staff SPA app client **`riffsync-staff-web-prod`** (Hosted UI + authorization code + PKCE).
- Fan JWTs are **rejected** at the API Gateway authorizer for **`/v1/admin/*`** routes (**401** at the edge for wrong pool / missing token).

Implementation pointers: `infra/cdk/lib/staff-auth-stack.ts`, `infra/cdk/lambda/admin-session-get.ts`, `apps/web/src/pages/admin/AdminLoginPage.tsx`, `apps/web/src/auth/staffHostedUiPkce.ts`.

## 2. Prerequisites

| Requirement | Notes |
| --- | --- |
| **`RiffSyncStaffAuth-prod` deployed** | Staff pool, Hosted UI domain, app client, and **`admin`** / **`curator`** groups exist ([#63](https://github.com/StacksOnTheRacks/riffsync/issues/63) / [#68](https://github.com/StacksOnTheRacks/riffsync/issues/68)). |
| **AWS Console (or CLI) access** | IAM allowing **`cognito-idp:AdminCreateUser`**, **`AdminAddUserToGroup`**, and read access to CloudFormation stacks in the production account/region. |
| **End-to-end browser smoke (optional until live)** | **`RiffSyncApi-prod`** with **`GET /v1/admin/session`** ([#64](https://github.com/StacksOnTheRacks/riffsync/issues/64)), prod SPA with **`VITE_STAFF_*`** ([#66](https://github.com/StacksOnTheRacks/riffsync/issues/66)), **`/admin/login`** Hosted UI flow ([#65](https://github.com/StacksOnTheRacks/riffsync/issues/65)). Sections 6–7 below assume these are deployed. |

## 3. Resolve stack outputs

Use **`us-east-1`** unless your deployment uses another Region consistently.

**Staff auth (`RiffSyncStaffAuth-prod`):**

```bash
export AWS_REGION=us-east-1
STAFF_STACK=RiffSyncStaffAuth-prod

aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STAFF_STACK" \
  --query 'Stacks[0].Outputs' --output table
```

Shell helpers for the keys referenced in this runbook:

```bash
staff_output() {
  aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STAFF_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

export STAFF_USER_POOL_ID="$(staff_output StaffUserPoolId)"
export STAFF_USER_POOL_CLIENT_ID="$(staff_output StaffUserPoolClientId)"
export STAFF_HOSTED_UI_BASE_URL="$(staff_output StaffHostedUiBaseUrl)"
export STAFF_HOSTED_UI_DOMAIN_PREFIX="$(staff_output StaffHostedUiDomainPrefix)"
```

| CfnOutput key | Use |
| --- | --- |
| **`StaffUserPoolId`** | Pool id in console navigation and CLI **`--user-pool-id`**. |
| **`StaffUserPoolArn`** | IAM policies, cross-stack references. |
| **`StaffUserPoolClientId`** | OAuth **`client_id`**; API JWT audience; **`VITE_STAFF_COGNITO_CLIENT_ID`** in prod SPA builds. |
| **`StaffHostedUiDomainPrefix`** | Cognito hosted domain prefix (default **`riffsync-staff-prod`**). |
| **`StaffHostedUiBaseUrl`** | Hosted UI base (**`https://<prefix>.auth.<region>.amazoncognito.com`**); **`VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN`** strips the **`https://`** prefix. |

**Fan web origin (`RiffSyncStatic-prod`) — prod admin login URL:**

```bash
STATIC_STACK=RiffSyncStatic-prod
export FAN_WEB_SITE_URL="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STATIC_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='FanWebSiteUrl'].OutputValue" --output text)"
echo "Admin login: ${FAN_WEB_SITE_URL}/admin/login"
```

**HTTP API (`RiffSyncApi-prod`) — session probe base:**

```bash
API_STACK=RiffSyncApi-prod
export API_BASE="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$API_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue" --output text)"
```

## 4. Create operator (AWS Console)

1. Open **AWS Console** → **Amazon Cognito** → **User pools** → **`riffsync-staff-prod`** (verify the name; do **not** use **`riffsync-fan-prod`**).
2. Choose **Create user** (equivalent to **`AdminCreateUser`**).
3. **Sign-in option:** **Email** (email alias). Use the operator’s work email.
4. **Temporary password vs invitation:**
   - **Send an email invitation** (recommended for first operators): Cognito emails a temporary password / invitation link using transactional mail from **`noreply@riffsync.tv`** via the shared SES configuration set **`riffsync-ses-send-prod`** (provisioned with fan auth, reused by the staff stack).
   - **Set a temporary password** (maintainer sets password manually): user must change password on first sign-in when that policy applies.
5. **Message action:** prefer **Send invitation** so the operator receives Cognito mail; if you suppress email, deliver credentials through your org’s secure channel.
6. Confirm the user record appears under **Users** with status **FORCE_CHANGE_PASSWORD** or **CONFIRMED** depending on the flow you chose.

**Transactional email:** outbound Cognito messages use the staff pool SES integration documented in **`infra/cdk/README.md`** (**Staff Cognito Hosted UI**). If invite mail does not arrive, see section 9 (SES / spam).

## 5. Assign group

Predefined groups are created by CDK on **`RiffSyncStaffAuth-prod`**:

| Group | Purpose (MVP) |
| --- | --- |
| **`admin`** | Full operator access label for **`/v1/admin/*`**. |
| **`curator`** | Curated catalog / roster tools label. |

**MVP authorization:** either **`admin`** or **`curator`** satisfies **`GET /v1/admin/session`** ( **`hasStaffRole`** in `infra/cdk/lambda/admin-session-shared.ts` ). Finer-grained splits per handler land in later catalog/admin issues.

**Console steps:**

1. Open the user → **Group memberships** → **Add user to group**.
2. Select **`admin`** or **`curator`** (one is enough for session smoke).
3. Save. New tokens issued **after** group assignment include **`cognito:groups`** in the JWT.

## 6. First sign-in (browser)

**URL (unlisted):** only **`${FanWebSiteUrl}/admin/login`** — there are **no** links from the public catalog, lobby, or room chrome. Resolve **`FanWebSiteUrl`** from section 3.

**When [#65](https://github.com/StacksOnTheRacks/riffsync/issues/65) + [#66](https://github.com/StacksOnTheRacks/riffsync/issues/66) are live:**

1. Open **`${FAN_WEB_SITE_URL}/admin/login`** in a browser (example: `https://riffsync.tv/admin/login`).
2. Complete **Cognito Hosted UI** sign-in (email + password / new-password challenge after invite).
3. Redirect lands on **`/admin/auth/callback`**, then the SPA routes to **`/admin`**.
4. On **`/admin`**, the session probe UI should show **`sub`**, **`email`**, and **`groups`** from **`GET /v1/admin/session`** (backed by `apps/web/src/api/staffAdminSessionApi.ts`).
5. **Staff sign-out** clears **`riffsync.staff*`** storage keys only; an active **fan** session on the same browser is unaffected.

**Obtain a staff access token for curl (section 7):** after a successful browser login, use devtools → **Network** → select the **`/v1/admin/session`** request → copy the **`Authorization: Bearer …`** access token. **Do not** commit tokens, paste them into tickets, or store them in runbook repos.

## 7. API smoke (curl)

After **`RiffSyncApi-prod`** deploy ([#64](https://github.com/StacksOnTheRacks/riffsync/issues/64)) and a valid **staff pool** access token:

```bash
export AWS_REGION=us-east-1
API_BASE="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name RiffSyncApi-prod \
  --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue" --output text)"
export STAFF_ACCESS_TOKEN="<staff_access_jwt>"
curl -sS -H "Authorization: Bearer $STAFF_ACCESS_TOKEN" "$API_BASE/v1/admin/session"
```

**Expected 200 body:**

```json
{"sub":"…","email":"…","groups":["admin"]}
```

(or **`"groups":["curator"]`**).

**403** when the JWT is valid for the staff authorizer but **`cognito:groups`** lacks both **`admin`** and **`curator`**:

```json
{"error":"Forbidden","code":"staff_group_required"}
```

**401** when the token is missing, expired, or from the **fan** pool (wrong issuer/audience for **`/v1/admin/*`**).

## 8. Security notes

| Topic | Guidance |
| --- | --- |
| **Unlisted admin URL** | **`/admin/login`** is intentionally omitted from public navigation; share the URL only with operators over trusted channels. |
| **Invite-only posture** | **`selfSignUpEnabled: false`**; no self-service staff registration in MVP. |
| **Cross-pool rejection** | Fan tokens must not work on **`/v1/admin/*`**; staff tokens must not satisfy fan room-admin checks. |
| **MFA** | Pool MFA is **OPTIONAL** at the Cognito level; enable MFA on operator accounts where your security policy requires it. |
| **Maintainer IAM** | Grant **`cognito-idp:AdminCreateUser`** / group APIs only to people who may invite operators; prefer least privilege. |
| **Secrets** | Never commit JWTs, temporary passwords, or console screenshots with credentials. |

## 9. Troubleshooting

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| **403** `staff_group_required` | User exists but no **`admin`** / **`curator`** group | Section 5; sign out and sign in again so groups appear in a fresh token. |
| **401** on **`/v1/admin/session`** | Fan token, wrong app client, or expired JWT | Token must be a **staff pool** access token with audience **`StaffUserPoolClientId`**. |
| Invite email not received | SES identity, spam, or suppressed message action | SES domain **`riffsync.tv`**, sender **`noreply@riffsync.tv`**, configuration set **`riffsync-ses-send-prod`**; operator spam folder. |
| Hosted UI **redirect_mismatch** | Callback URL not on app client allowlist | App client **`riffsync-staff-web-prod`** must list **`https://<host>/admin/auth/callback`** for your **`FanWebSiteUrl`** host; see **`staffAuthOAuthExtras`** in **`infra/cdk/README.md`**. |
| Session UI empty but login “works” | API or SPA staff env not deployed | Confirm **`RiffSyncApi-prod`**, **`VITE_STAFF_*`** on static deploy ([#64](https://github.com/StacksOnTheRacks/riffsync/issues/64), [#66](https://github.com/StacksOnTheRacks/riffsync/issues/66)). |

## Appendix: AWS CLI (`admin-create-user`)

Secondary to console steps (Phase C). Replace placeholders; deliver the temporary password securely.

```bash
export AWS_REGION=us-east-1
export STAFF_USER_POOL_ID="<from StaffUserPoolId output>"

aws cognito-idp admin-create-user \
  --region "$AWS_REGION" \
  --user-pool-id "$STAFF_USER_POOL_ID" \
  --username "operator@example.com" \
  --user-attributes Name=email,Value=operator@example.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL

aws cognito-idp admin-add-user-to-group \
  --region "$AWS_REGION" \
  --user-pool-id "$STAFF_USER_POOL_ID" \
  --username "operator@example.com" \
  --group-name admin
```

Use **`--message-action SUPPRESS`** only when you intentionally skip Cognito email and distribute credentials out of band.

## Related documentation

| Document | Role |
| --- | --- |
| **`infra/cdk/README.md`** | Staff Cognito stack, outputs, deploy ordering |
| **`.ai/integration/authorization.md`** | Staff vs fan pools, enforcement |
| **`.ai/integration/api_contracts.md`** | **`GET /v1/admin/session`** contract |
| **`.ai/operations/deployment_environments.md`** | Prod deploy waves (staff auth before API/SPA) |
| **`.ai/interface/interaction_flow.md`** | Unlisted **`/admin/login`** |
