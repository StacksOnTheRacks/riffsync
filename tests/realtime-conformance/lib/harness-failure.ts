import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type HarnessDrawer = 'chat' | 'signaling' | 'connectivity' | 'produce_consume'

export type HarnessFailureRow = {
  drawer: HarnessDrawer
  code: string
  step: string
  outcome: 'failed'
}

function resolveRepoRoot(): string {
  const meta = import.meta.url
  if (meta.startsWith('file:')) {
    return path.resolve(fileURLToPath(new URL('../../..', meta)))
  }
  return path.resolve(process.cwd(), '../..')
}

const repoRoot = resolveRepoRoot()
const summaryPath = path.join(repoRoot, 'harness-summary.json')

let failures: HarnessFailureRow[] = []

export function resetHarnessFailures(): void {
  failures = []
}

export function recordHarnessFailure(row: HarnessFailureRow): void {
  failures.push(row)
}

export function failHarness(
  drawer: HarnessDrawer,
  code: string,
  step: string,
  message?: string,
): never {
  const row: HarnessFailureRow = { drawer, code, step, outcome: 'failed' }
  recordHarnessFailure(row)
  writeHarnessSummary()
  const line = `[drawer=${drawer}] code=${code} step=${step}`
  if (message) {
    console.error(`${line} ${message}`)
  } else {
    console.error(line)
  }
  process.exit(1)
}

export function writeHarnessSummary(): void {
  if (failures.length === 0) return
  fs.writeFileSync(summaryPath, `${JSON.stringify(failures, null, 2)}\n`, 'utf8')
}
