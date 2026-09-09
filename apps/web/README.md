# RiffSync fan SPA (`apps/web`)

Vite + React + TypeScript. **Local:**

```bash
# From the repo root: write `.env.local` from production CloudFormation
# (API, room WebSocket, Cognito). Uses AWS CLI profile `me`.
npm run dev:env

cd apps/web
npm ci
npm run dev
```

`npm run dev:env -- --media local` also points mediasoup at `ws://127.0.0.1:3000` (see repo README, **Local watch-party media**).

**Production / CI** artifact publish (`npm run build` → `dist/`, **`aws s3 sync`**, CloudFront invalidation) runs from [**Deploy CDK (production)**](../../.github/workflows/deploy-prod.yml) after `cdk deploy`. See [**`infra/cdk/README.md`**](../../infra/cdk/README.md) (Fan SPA publish, smoke checks).
