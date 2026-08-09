import { randomBytes, randomUUID } from 'node:crypto'
import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const PAIRING_TTL_SECONDS = 15 * 60
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

type PairingItem = {
  code: string
  pairingId: string
  pollToken: string
  claimToken?: string
  status: 'waiting' | 'linked'
  expiresAt: number
  createdAt: number
  roomId?: string
  sessionId?: string
  apiBaseUrl?: string
  tvClientSessionId?: string
  snapshotJson?: string
  chatOverlayJson?: string
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }
}

function tableName(): string | null {
  const name = process.env.TV_PAIRING_TABLE_NAME?.trim()
  return name || null
}

function mintCode(): string {
  const bytes = randomBytes(6)
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!
  }
  return out
}

function mintToken(): string {
  return randomBytes(24).toString('base64url')
}

function routeKind(
  method: string,
  rawPath: string,
): 'create' | 'poll' | 'claim' | 'presentation' | 'unknown' {
  const path = rawPath.replace(/\/+$/, '') || '/'
  if (method === 'POST' && path.endsWith('/v1/tv/pairing')) return 'create'
  if (method === 'POST' && path.endsWith('/v1/tv/pairing/claim')) return 'claim'
  if (method === 'GET' && /\/v1\/tv\/pairing\/[^/]+$/.test(path)) return 'poll'
  if (method === 'PUT' && /\/v1\/tv\/pairing\/[^/]+\/presentation$/.test(path)) return 'presentation'
  return 'unknown'
}

function parseBody(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

async function createPairing(table: string): Promise<APIGatewayProxyResultV2> {
  const now = Math.floor(Date.now() / 1000)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = mintCode()
    const pairingId = randomUUID()
    const pollToken = mintToken()
    const item: PairingItem = {
      code,
      pairingId,
      pollToken,
      status: 'waiting',
      createdAt: now,
      expiresAt: now + PAIRING_TTL_SECONDS,
    }
    try {
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: item,
          ConditionExpression: 'attribute_not_exists(code)',
        }),
      )
      return json(201, {
        pairingId,
        code,
        pollToken,
        expiresInSeconds: PAIRING_TTL_SECONDS,
      })
    } catch (error) {
      const name = error && typeof error === 'object' ? (error as { name?: string }).name : undefined
      if (name !== 'ConditionalCheckFailedException') throw error
    }
  }
  return json(503, { error: 'Could not allocate pairing code' })
}

async function pollPairing(
  table: string,
  pairingId: string,
  pollToken: string | undefined,
): Promise<APIGatewayProxyResultV2> {
  if (!pollToken) return json(400, { error: 'pollToken is required' })

  // pairingId is not the Dynamo key; scan via GSI would be ideal. We store dual keys:
  // code (PK) and also write pairingId as attribute. For poll we look up by pairingId GSI.
  // Until GSI is used in Get, clients pass pairingId and we query by pairingId attribute via
  // a dedicated PK on pairingId — table uses pairingId as PK (see stack). Poll uses pairingId.
  const out = await doc.send(
    new GetCommand({
      TableName: table,
      Key: { pairingId },
    }),
  )
  const item = out.Item as PairingItem | undefined
  if (!item) return json(404, { error: 'Pairing not found' })
  if (item.pollToken !== pollToken) return json(403, { error: 'Invalid poll token' })

  const now = Math.floor(Date.now() / 1000)
  if (item.expiresAt <= now) return json(200, { status: 'expired' })

  if (item.status !== 'linked') {
    return json(200, { status: 'waiting' })
  }

  let snapshot: unknown
  let chatOverlay: unknown
  if (item.snapshotJson) {
    try {
      snapshot = JSON.parse(item.snapshotJson) as unknown
    } catch {
      snapshot = undefined
    }
  }
  if (item.chatOverlayJson) {
    try {
      chatOverlay = JSON.parse(item.chatOverlayJson) as unknown
    } catch {
      chatOverlay = undefined
    }
  }

  return json(200, {
    status: 'linked',
    tvClientSessionId: item.tvClientSessionId,
    livePlayback:
      item.roomId && item.sessionId
        ? {
            roomId: item.roomId,
            sessionId: item.sessionId,
            ...(item.apiBaseUrl ? { apiBaseUrl: item.apiBaseUrl } : {}),
          }
        : undefined,
    ...(snapshot !== undefined ? { snapshot } : {}),
    ...(chatOverlay !== undefined ? { chatOverlay } : {}),
  })
}

async function claimPairing(table: string, body: Record<string, unknown>): Promise<APIGatewayProxyResultV2> {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const apiBaseUrl = typeof body.apiBaseUrl === 'string' ? body.apiBaseUrl.trim() : undefined
  const tvClientSessionId =
    typeof body.tvClientSessionId === 'string' && body.tvClientSessionId.trim()
      ? body.tvClientSessionId.trim()
      : `tv-client-${randomUUID()}`

  if (!code || !roomId || !sessionId) {
    return json(400, { error: 'code, roomId, and sessionId are required' })
  }

  const queried = await doc.send(
    new QueryCommand({
      TableName: table,
      IndexName: 'code-index',
      KeyConditionExpression: 'code = :code',
      ExpressionAttributeValues: { ':code': code },
      Limit: 1,
    }),
  )
  const item = queried.Items?.[0] as PairingItem | undefined
  if (!item) return json(404, { error: 'Invalid or expired TV code' })

  const now = Math.floor(Date.now() / 1000)
  if (item.expiresAt <= now) return json(410, { error: 'TV code expired' })
  if (item.status === 'linked') return json(409, { error: 'TV code already linked' })

  const claimToken = mintToken()
  try {
    await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: { pairingId: item.pairingId },
        ConditionExpression: '#status = :waiting AND expiresAt > :now',
        UpdateExpression:
          'SET #status = :linked, claimToken = :claimToken, roomId = :roomId, sessionId = :sessionId, tvClientSessionId = :tvClientSessionId' +
          (apiBaseUrl ? ', apiBaseUrl = :apiBaseUrl' : ''),
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':waiting': 'waiting',
          ':linked': 'linked',
          ':now': now,
          ':claimToken': claimToken,
          ':roomId': roomId,
          ':sessionId': sessionId,
          ':tvClientSessionId': tvClientSessionId,
          ...(apiBaseUrl ? { ':apiBaseUrl': apiBaseUrl } : {}),
        },
      }),
    )
  } catch (error) {
    const name = error && typeof error === 'object' ? (error as { name?: string }).name : undefined
    if (name === 'ConditionalCheckFailedException') {
      return json(409, { error: 'TV code already linked or expired' })
    }
    throw error
  }

  return json(200, {
    pairingId: item.pairingId,
    tvClientSessionId,
    claimToken,
  })
}

async function pushPresentation(
  table: string,
  pairingId: string,
  body: Record<string, unknown>,
): Promise<APIGatewayProxyResultV2> {
  const claimToken = typeof body.claimToken === 'string' ? body.claimToken : ''
  if (!claimToken) return json(400, { error: 'claimToken is required' })
  if (!body.snapshot || typeof body.snapshot !== 'object') {
    return json(400, { error: 'snapshot is required' })
  }

  const out = await doc.send(
    new GetCommand({
      TableName: table,
      Key: { pairingId },
    }),
  )
  const item = out.Item as PairingItem | undefined
  if (!item) return json(404, { error: 'Pairing not found' })
  if (item.claimToken !== claimToken) return json(403, { error: 'Invalid claim token' })
  if (item.status !== 'linked') return json(409, { error: 'Pairing is not linked' })

  const now = Math.floor(Date.now() / 1000)
  if (item.expiresAt <= now) return json(410, { error: 'Pairing expired' })

  const chatOverlay = body.chatOverlay
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: { pairingId },
      UpdateExpression:
        'SET snapshotJson = :snapshotJson' +
        (chatOverlay !== undefined ? ', chatOverlayJson = :chatOverlayJson' : '') +
        ', expiresAt = :expiresAt',
      ExpressionAttributeValues: {
        ':snapshotJson': JSON.stringify(body.snapshot),
        ...(chatOverlay !== undefined
          ? { ':chatOverlayJson': JSON.stringify(chatOverlay) }
          : {}),
        ':expiresAt': now + PAIRING_TTL_SECONDS,
      },
    }),
  )
  return json(204, {})
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const table = tableName()
  if (!table) return json(500, { error: 'Missing TV_PAIRING_TABLE_NAME' })

  const method = event.requestContext.http.method
  const rawPath = event.rawPath || event.requestContext.http.path
  const kind = routeKind(method, rawPath)

  if (kind === 'create') return createPairing(table)

  if (kind === 'poll') {
    const pairingId = event.pathParameters?.pairingId
    if (!pairingId) return json(400, { error: 'Missing pairingId' })
    const pollToken =
      event.queryStringParameters?.pollToken ??
      (typeof event.headers?.['x-poll-token'] === 'string'
        ? event.headers['x-poll-token']
        : undefined)
    return pollPairing(table, pairingId, pollToken)
  }

  if (kind === 'claim') {
    const body = parseBody(event.body)
    if (!body) return json(400, { error: 'Invalid JSON body' })
    return claimPairing(table, body)
  }

  if (kind === 'presentation') {
    const pairingId = event.pathParameters?.pairingId
    if (!pairingId) return json(400, { error: 'Missing pairingId' })
    const body = parseBody(event.body)
    if (!body) return json(400, { error: 'Invalid JSON body' })
    return pushPresentation(table, pairingId, body)
  }

  return json(404, { error: 'Not found' })
}
