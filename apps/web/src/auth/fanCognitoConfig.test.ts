// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensureFanCognitoConfigured,
  readFanCognitoEnv,
  regionFromUserPoolId,
  resetFanCognitoConfigForTests,
} from './fanCognitoConfig'

vi.mock('aws-amplify', () => ({
  Amplify: { configure: vi.fn() },
}))

describe('fanCognitoConfig', () => {
  beforeEach(() => {
    resetFanCognitoConfigForTests()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetFanCognitoConfigForTests()
  })

  it('reads env when all three vars are present', () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_ABC')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client')
    vi.stubEnv('VITE_COGNITO_REGION', 'us-east-1')

    expect(readFanCognitoEnv()).toEqual({
      userPoolId: 'us-east-1_ABC',
      userPoolClientId: 'client',
      region: 'us-east-1',
    })
  })

  it('derives region prefix from pool id', () => {
    expect(regionFromUserPoolId('us-west-2_XYZ')).toBe('us-west-2')
  })

  it('throws when SRP env is missing', () => {
    expect(() => ensureFanCognitoConfigured()).toThrow(/Missing fan Cognito SRP configuration/)
  })
})
