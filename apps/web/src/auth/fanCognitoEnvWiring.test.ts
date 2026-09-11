import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function readRepoFile(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf8')
}

function viteEnvLines(content: string): string[] {
  return content.split('\n').filter((line) => line.includes('VITE_'))
}

describe('fan Cognito env wiring', () => {
  it('deploy-prod.yml emits pool id and region vite vars without secrets', () => {
    const yml = readRepoFile('.github/workflows/deploy-prod.yml')
    expect(yml).toContain('VITE_COGNITO_USER_POOL_ID')
    expect(yml).toContain('VITE_COGNITO_REGION')
    expect(yml).toContain("OutputKey=='FanUserPoolId'")
    for (const line of viteEnvLines(yml)) {
      expect(line).not.toMatch(/CLIENT_SECRET|AWS_ACCESS_KEY|AWS_SECRET/)
    }
  })

  it('write-web-env-from-prod.sh emits pool id and region vite vars', () => {
    const sh = readRepoFile('scripts/dev/write-web-env-from-prod.sh')
    expect(sh).toContain('VITE_COGNITO_USER_POOL_ID')
    expect(sh).toContain('VITE_COGNITO_REGION')
    expect(sh).toContain('FanUserPoolId')
    for (const line of viteEnvLines(sh)) {
      expect(line).not.toMatch(/CLIENT_SECRET|AWS_ACCESS_KEY|AWS_SECRET/)
    }
  })

  it('vite-env.d.ts declares public fan cognito vars only', () => {
    const dts = readRepoFile('apps/web/src/vite-env.d.ts')
    expect(dts).toContain('VITE_COGNITO_USER_POOL_ID')
    expect(dts).toContain('VITE_COGNITO_REGION')
    expect(dts).not.toMatch(/CLIENT_SECRET|AWS_ACCESS_KEY|AWS_SECRET/)
  })
})
