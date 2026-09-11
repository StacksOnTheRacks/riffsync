import { Amplify } from 'aws-amplify'

let configured = false

export interface FanCognitoEnv {
  userPoolId: string
  userPoolClientId: string
  region: string
}

export function readFanCognitoEnv(): FanCognitoEnv | null {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID?.trim()
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID?.trim()
  const region = import.meta.env.VITE_COGNITO_REGION?.trim()

  if (!userPoolId || !userPoolClientId || !region) return null
  return { userPoolId, userPoolClientId, region }
}

export function regionFromUserPoolId(userPoolId: string): string | null {
  const idx = userPoolId.indexOf('_')
  if (idx <= 0) return null
  return userPoolId.slice(0, idx)
}

/** Throws when SRP env is missing; no-op when already configured. */
export function ensureFanCognitoConfigured(): FanCognitoEnv {
  const env = readFanCognitoEnv()
  if (!env) {
    throw new Error(
      'Missing fan Cognito SRP configuration (VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_CLIENT_ID, VITE_COGNITO_REGION)',
    )
  }

  if (!configured) {
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: env.userPoolId,
          userPoolClientId: env.userPoolClientId,
        },
      },
    })
    configured = true
  }

  return env
}

export function resetFanCognitoConfigForTests(): void {
  configured = false
}
