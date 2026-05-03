# RiffSync fan SPA (`apps/web`)

Vite + React + TypeScript. **Local:**

```bash
npm ci
npm run dev
```

**Staging / production** artifact publish (`npm run build` → `dist/`, **`aws s3 sync`**, CloudFront invalidation) runs from [**Deploy CDK (staging)**](../../.github/workflows/deploy-staging.yml) and [**Deploy CDK (production)**](../../.github/workflows/deploy-prod.yml) after `cdk deploy`. See [**`infra/cdk/README.md`**](../../infra/cdk/README.md) (Fan SPA publish, smoke checks).
