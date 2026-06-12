import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HARNESS_SFU_WS_BASE } from './harness-constants.js'

function resolveRepoRoot(): string {
  const meta = import.meta.url
  if (meta.startsWith('file:')) {
    return path.resolve(fileURLToPath(new URL('../../..', meta)))
  }
  return path.resolve(process.cwd(), '../..')
}

const repoRoot = resolveRepoRoot()
const localMediaDir = path.join(repoRoot, 'infra/local-media')
const envFile = path.join(localMediaDir, '.env')
const turnConfFile = path.join(localMediaDir, 'coturn/turnserver.conf')

function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    out[key] = value
  }
  return out
}

function readTurnStaticSecret(): string {
  if (!fs.existsSync(turnConfFile)) {
    return 'local-dev-turn-secret'
  }
  const raw = fs.readFileSync(turnConfFile, 'utf8')
  const match = /^static-auth-secret=(.+)$/m.exec(raw)
  const secret = match?.[1]?.trim()
  if (!secret || secret === 'REPLACE_WITH_TURN_STATIC_AUTH_SECRET') {
    return 'local-dev-turn-secret'
  }
  return secret
}

function buildTurnIceServers(secret: string): RTCIceServer[] {
  const ttl = Math.floor(Date.now() / 1000) + 86_400
  const username = `${ttl}:harness`
  const credential = crypto
    .createHmac('sha1', secret)
    .update(username)
    .digest('base64')

  return [
    {
      urls: ['stun:127.0.0.1:3478', 'turn:127.0.0.1:3478?transport=udp'],
      username,
      credential,
    },
  ]
}

export type HarnessEnv = {
  sfuJwtSecret: string
  sfuWsBase: string
  getIceServers: () => Promise<RTCIceServer[]>
}

export function loadHarnessEnv(): HarnessEnv {
  let sfuJwtSecret = process.env.SFU_JWT_SECRET?.trim() ?? ''
  if (!sfuJwtSecret && fs.existsSync(envFile)) {
    const parsed = parseDotEnv(fs.readFileSync(envFile, 'utf8'))
    sfuJwtSecret = parsed.SFU_JWT_SECRET?.trim() ?? ''
  }
  if (!sfuJwtSecret) {
    sfuJwtSecret = 'local-dev-sfu-join-secret-replace-me'
  }

  const turnSecret = readTurnStaticSecret()
  const iceServers = buildTurnIceServers(turnSecret)

  return {
    sfuJwtSecret,
    sfuWsBase: process.env.HARNESS_SFU_WS_URL?.trim() || HARNESS_SFU_WS_BASE,
    getIceServers: async () => iceServers,
  }
}
